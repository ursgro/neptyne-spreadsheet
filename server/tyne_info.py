import asyncio
import base64
import copy
import dataclasses
import inspect
import logging
import sys
import time
import traceback
from asyncio import CancelledError
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from queue import Empty
from typing import (
    Any,
    Awaitable,
    Callable,
    cast,
)

from jupyter_client import AsyncKernelClient, KernelClient
from jupyter_client.channels import AsyncZMQSocketChannel
from jupyter_client.session import Session as KernelSession
from opentelemetry import trace
from zmq.asyncio import Context
from zmq.eventloop.zmqstream import ZMQStream

from neptyne_kernel import expression_compiler
from neptyne_kernel.cell_address import (
    Address,
    Range,
)
from neptyne_kernel.cell_copier import extend_cells
from neptyne_kernel.dash import (
    Dash,
)
from neptyne_kernel.kernel_runtime import email_to_color
from neptyne_kernel.mime_handling import (
    as_json,
    is_number_string,
)
from neptyne_kernel.neptyne_protocol import (
    CellChange,
    MessageTypes,
    RunCellsContent,
    SheetAutofillContent,
    WidgetGetStateContent,
    WidgetValidateParamsContent,
    WidgetValueContent,
)
from neptyne_kernel.session_info import NeptyneSessionInfo
from neptyne_kernel.tyne_model.cell import (
    CODEPANEL_CELL_ID,
    NotebookCell,
    output_from_dict,
    output_to_dict,
)
from neptyne_kernel.tyne_model.events import Event, Severity
from neptyne_kernel.tyne_model.kernel_init_data import (
    TyneInitializationData,
)
from neptyne_kernel.tyne_model.table_for_ai import TableForAI

from .codeassist import (
    ReplCodeAssistReply,
    ai_history,
    fill_in_table,
    maybe_inline_code,
    merge_code_reply,
    repl_code_assist,
    try_codex,
)
from .messages import (
    CELL_ID_TAG,
    CODE_TAG,
    CONTENT_TAG,
    HEADER_TAG,
    IS_INIT_CELL_TAG,
    META_DATA_TAG,
    MSG_ID_TAG,
    MSG_TYPE_TAG,
    ORG_MSG_TYPE_TAG,
    PARENT_HEADER_TAG,
    KernelMessageHandler,
    MessageList,
    Msg,
    default_msg,
    split_batch_message,
)
from .models import Tyne
from .neptyne_kernel_service import NeptyneKernelService
from .neptyne_notebook import TyneNotebook
from .serialize_orm_tynes import notebook_cells_from_orm_model
from .tracing import inject_trace_context

TYNE_PROTOCOL_VERSION = 4

logger = logging.getLogger("kernelLogger")
tracer = trace.get_tracer(__name__)

SheetCellUpdate = tuple[Address, str, dict[str, Any] | None, str | None]


def log_kernel_msg(
    direction: str,
    msg: Msg | str,
    tyne_file_name: str | None,
    channel: Any,
    idents: int | None = None,
) -> None:
    if isinstance(msg, str):
        # one type of message is not actually a dict
        msg_id = ""
        session = ""
        msg_type = ""
    else:
        msg_id = msg.get(HEADER_TAG, {}).get(MSG_ID_TAG, "")
        session = msg.get(HEADER_TAG, {}).get("session", "")
        msg_type = msg.get(HEADER_TAG, {}).get(MSG_TYPE_TAG, "")

    logger.debug(
        "%s kernel message on channel=%s: msg_id=%s\nidents=%s",
        direction,
        channel or "<unknown>",
        msg_id,
        idents,
        extra={
            "labels": {
                "event": direction,
                "tyne_file_name": tyne_file_name,
                "session": session,
                "msg_type": msg_type,
                "msg_id": msg_id,
            },
            "json_fields": {
                "msg": as_json(msg),
            },
        },
    )


class KernelInitTimeout(Exception):
    def __init__(self, cell_id: str):
        super().__init__(f"Timeout running cell: {cell_id}")


class TyneInfoCaller:
    def reply(
        self,
        original_message: Msg | None,
        reply_content: dict,
        reply_msg_type: str,
        undo: Msg | None = None,
        metadata: dict | None = None,
        header: dict | None = None,
        just_to_self: bool | None = False,
    ) -> None:
        raise NotImplementedError

    def get_tyne_secrets(self) -> dict[str, str]:
        raise NotImplementedError

    def kernel_state_saving(self) -> None:
        raise NotImplementedError

    def kernel_state_saved(self) -> None:
        raise NotImplementedError

    def handle_kernel_lost(self) -> None:
        raise NotImplementedError

    async def save_notebook(self) -> None:
        raise NotImplementedError


@dataclass
class KernelSubscriber:
    on_kernel_msg: Callable
    user_email: str
    user_name: str
    user_profile_image: str
    close: Callable

    def to_json(self) -> dict[str, str]:
        return {
            "user_email": self.user_email,
            "user_color": email_to_color(self.user_email),
            "user_name": self.user_name,
            "user_profile_image": self.user_profile_image,
        }


async def check_kernel_init_status(
    kernel_client: AsyncKernelClient, timeout: float
) -> bool:
    content = dict(
        code="if not N_.initialized: raise RuntimeError('Failed to initialize kernel')",
        silent=True,
        store_history=False,
        user_expressions={},
        allow_stdin=False,
        stop_on_error=True,
    )
    session = kernel_client.session
    control_channel = AsyncZMQSocketChannel(
        kernel_client.connect_control(identity=session.bsession),  # type: ignore
        session,
    )
    msg = session.msg("execute_request", content)
    msg_id = msg[HEADER_TAG][MSG_ID_TAG]
    control_channel.send(msg)

    deadline = time.monotonic() + timeout
    while True:
        timeout = max(0.0, deadline - time.monotonic())
        try:
            # The "type: ignore" is because jupyter's 'Any' is not really 'Any'
            reply = await control_channel.get_msg(timeout=timeout)
        except Empty:
            raise TimeoutError("Timed out waiting for kernel to respond")
        if reply[PARENT_HEADER_TAG].get(MSG_ID_TAG) == msg_id:
            return reply[CONTENT_TAG]["status"] == "ok"


class TyneInfo:
    notebook: TyneNotebook
    kernel_client: KernelClient | None
    channels: dict
    tyne_id: int | None
    events: list[Event]
    heartbeat_stream: ZMQStream | None
    heartbeat_task: asyncio.Task | None
    last_heartbeat: datetime | None

    def __init__(
        self,
        file_name: str,
        name: str | None = None,
        version: int = TYNE_PROTOCOL_VERSION,
    ) -> None:
        self.file_name = file_name
        self.tyne_id = None
        self.name = name if name else "Untitled"
        self.version = version
        self.heartbeat_stream = None
        self.heartbeat_task = None
        self.last_heartbeat = None

        self.ticking = False
        self.kernel_client = None
        self.channels = {}
        self.connect_lock = asyncio.Lock()
        self.msg_done_events = dict[str, asyncio.Event]()
        self.events = []

    @property
    def kernel_session(self) -> KernelSession:
        assert self.kernel_client
        return self.kernel_client.session

    def session_send(
        self,
        stream: Any,
        msg: Msg,
        kernel_session: KernelSession | None = None,
    ) -> None:
        log_kernel_msg("send", msg, self.file_name, channel=stream.channel)
        if not kernel_session:
            kernel_session = self.kernel_session
        assert kernel_session
        inject_trace_context(msg)
        kernel_session.send(stream, msg)

    def handle_ai_client_reply(
        self,
        msg: Msg,
        cell_id: str,
        prompt: str,
        repl_reply: ReplCodeAssistReply,
        replier: TyneInfoCaller,
        start_time: float,
    ) -> None:
        extra = repl_reply.extra
        if not (
            repl_reply.repl
            or repl_reply.extra
            or repl_reply.cells_to_update
            or repl_reply.code_pane != self.notebook.code_panel_code()
        ):
            extra = "Can you reformulate that?"
        duration = time.time() - start_time
        execution_count = 1
        output = output_from_dict(
            {
                "output_type": "execute_result",
                "data": {"application/aiviewer": extra} if extra else {},
                "execution_count": execution_count,
            }
        )
        nb_cell = NotebookCell(
            cell_id=cell_id,
            raw_code=prompt,
            execution_count=execution_count,
            outputs=[output],
            metadata={
                "date": datetime.utcnow().isoformat(),
                "duration": duration,
                "ai_prompt": repl_reply.ai_prompt,
                "ai_response": repl_reply.ai_response,
            },
        )
        self.notebook.cells.append(nb_cell)
        replier.reply(
            msg,
            {
                "execution_count": nb_cell.execution_count,
                "status": "ok",
                "cell": nb_cell.export(omit_outputs=True),
            },
            reply_msg_type="execute_reply",
            metadata={"cellId": cell_id},
            header={"server_duration": duration},
        )
        if extra:
            replier.reply(
                msg,
                {
                    **output_to_dict(output),
                    "cell": nb_cell.export(omit_outputs=True),
                    "execution_count": nb_cell.execution_count,
                    "metadata": {"cellId": cell_id},
                },
                reply_msg_type="execute_result",
                metadata={"cellId": cell_id},
            )
        replier.reply(
            msg,
            {"execution_state": "idle", "cell_id": cell_id},
            reply_msg_type="status",
        )

    async def ask_gpt(
        self,
        cell_id: str,
        msg: Msg,
        replier: TyneInfoCaller,
        prompt: str,
        ai_tables_dicts: list[dict],
        current_sheet_name: str,
        sheet_ids_by_name: dict[str, int],
        *,
        gs_mode: bool = False,
    ) -> None:
        start_time = time.time()
        replier.reply(
            msg,
            {"execution_state": "busy", "cell_id": cell_id},
            reply_msg_type="status",
        )

        ai_tables = [TableForAI.from_dict(table_dict) for table_dict in ai_tables_dicts]

        repl_reply = await repl_code_assist(
            prompt,
            self.notebook.code_panel_code(),
            ai_tables=ai_tables,
            current_sheet_name=current_sheet_name,
            history=ai_history(self.notebook.cells),
            gs_mode=gs_mode,
        )

        self.handle_ai_client_reply(
            msg, cell_id, prompt, repl_reply, replier, start_time
        )
        if repl_reply.code_pane != self.notebook.code_panel_code():
            merged = merge_code_reply(
                self.notebook.code_panel_code(), repl_reply.code_pane
            )
            if merged is None:
                repl_reply.extra = "Can you reformulate that?"
            else:
                run_notebook_msg = copy.deepcopy(msg)
                await self.run_notebook_cell(
                    run_notebook_msg,
                    CODEPANEL_CELL_ID,
                    merged,
                    reason="code-assist",
                    replier=replier,
                )
        self.handle_ai_client_reply(
            msg, cell_id, prompt, repl_reply, replier, start_time
        )

        sheet_cell_updates: list[SheetCellUpdate] = []

        if "tracker" in msg:
            # TODO: when does this happen?
            msg = {k: v for k, v in msg.items() if k != "tracker"}

        for a1, content in repl_reply.cells_to_update:
            # Sheet name should always be present
            if "!" not in a1:
                print(
                    "gpt3 response error: no sheet name in A1 address",
                    a1,
                    file=sys.stderr,
                )
                continue
            sheet_name, a1 = a1.rsplit("!", 1)
            if ":" in a1:
                start, end = a1.split(":", 1)
                try:
                    dy = Address.from_a1(end).row - Address.from_a1(start).row
                except ValueError:
                    print(
                        "gpt3 response error: invalid A1 address",
                        a1,
                        file=sys.stderr,
                    )
                    continue
                a1 = start
                if dy == 0 and content.startswith("="):
                    # if we have a vertical list or a two dimensional array, normal spilling will work
                    # for horizontal lists, we need to pack the content in an inner list
                    content = f"=[{content[1:]}]"
            if (
                sheet_name.startswith("'") or sheet_name.startswith('"')
            ) and sheet_name.endswith(sheet_name[0]):
                quote = sheet_name[0]
                stripped_sheet_name = sheet_name[1:-1].replace("\\" + quote, quote)
                if stripped_sheet_name in sheet_ids_by_name:
                    sheet_name = stripped_sheet_name
            if (sheet_id := sheet_ids_by_name.get(sheet_name, -1)) == -1:
                print(
                    "gpt3 response error: unknown sheet name",
                    sheet_name,
                    file=sys.stderr,
                )
                continue
            try:
                sheet_cell_updates.append(
                    (Address.from_a1(a1, sheet_id), content, None, None)
                )
            except ValueError:
                print(
                    "gpt3 response error: invalid A1 address",
                    a1,
                    file=sys.stderr,
                )
                continue

        if repl_reply.repl:
            repl_msg = copy.deepcopy(msg)
            repl_msg[HEADER_TAG]["date"] = datetime.utcnow().isoformat()
            next_cell_id = f"0{int(cell_id) + 1}"
            await self.run_notebook_cell(
                repl_msg, next_cell_id, repl_reply.repl, reason="gpt", replier=replier
            )

        if sheet_cell_updates:
            self.update_cell_values(
                msg,
                sheet_cell_updates,
                reason="gpt",
            )

    async def run_notebook_cell(
        self,
        msg: Msg,
        cell_id: str,
        code: str,
        reason: str,
        *,
        replier: TyneInfoCaller | None = None,
        kernel_session: KernelSession | None = None,
    ) -> None:
        if kernel_session is None:
            kernel_session = self.kernel_session

        code, msg, undo_msg = self.notebook.run_notebook_cell_msg(msg, cell_id, code)
        cell = self.notebook.get_cell_by_id(cell_id)

        if replier:
            replier.reply(msg, cell.export(), MessageTypes.ACK_RUN_CELLS.value)
        self.execute_code_in_kernel(
            msg,
            code,
            kernel_session=kernel_session,
            reason=reason,
            undo=undo_msg,
            store_history=True,
        )

        if replier:
            await replier.save_notebook()

    def update_cell_values(
        self,
        msg: Msg,
        cell_updates: list[SheetCellUpdate],
        reason: str,
        *,
        kernel_session: KernelSession | None = None,
    ) -> None:
        if kernel_session is None:
            kernel_session = self.kernel_session

        cell_changes = [
            CellChange(attributes, cell_id.to_float_coord(), code, mime_type).to_dict()
            for cell_id, code, attributes, mime_type in cell_updates
        ]

        self.execute_code_in_kernel(
            msg,
            f"N_.run_cells_with_cascade(cell_changes={cell_changes}, undoable=True)",
            kernel_session=kernel_session,
            reason=reason,
            skip_input_transformers=True,
        )

    async def run_cells(
        self,
        msg: Msg,
        replier: TyneInfoCaller,
        kernel_session: KernelSession | None = None,
    ) -> None:
        if kernel_session is None:
            kernel_session = self.kernel_session
        run_cell_content = RunCellsContent.from_dict(msg[CONTENT_TAG])
        if run_cell_content.notebook:
            assert len(run_cell_content.to_run) == 1
            to_run = run_cell_content.to_run[0]
            if to_run.cell_id is None:
                new_cell = self.notebook.new_cell()
                to_run.cell_id = new_cell.cell_id
            assert isinstance(to_run.cell_id, str), to_run.cell_id
            if run_cell_content.for_ai:
                if (
                    run_cell_content.ai_tables is not None
                    and run_cell_content.sheet_ids_by_name is not None
                    and run_cell_content.current_sheet_name is not None
                ):
                    sheet_ids_by_name = {
                        s: int(i) for s, i in run_cell_content.sheet_ids_by_name.items()
                    }
                    await self.ask_gpt(
                        to_run.cell_id,
                        msg,
                        replier,
                        to_run.content,
                        run_cell_content.ai_tables,
                        run_cell_content.current_sheet_name,
                        sheet_ids_by_name,
                        gs_mode=run_cell_content.gs_mode,
                    )
                else:
                    self.execute_code_in_kernel(
                        msg,
                        f"N_.add_ai_table_to_run_cells_content({msg[CONTENT_TAG]!r})",
                        kernel_session=kernel_session,
                        reason="add_ai_table_to_run_cells_content",
                        skip_input_transformers=True,
                    )
            else:
                await self.run_notebook_cell(
                    msg,
                    to_run.cell_id,
                    to_run.content,
                    MessageTypes.RUN_CELLS.value,
                    kernel_session=kernel_session,
                    replier=replier,
                )

        else:
            to_run = msg["content"]["toRun"]
            self.execute_code_in_kernel(
                msg,
                f"N_.run_cells_with_cascade(cell_changes={to_run}, undoable=True)",
                kernel_session=kernel_session,
                reason=MessageTypes.RUN_CELLS.value,
                skip_input_transformers=True,
            )

    def copy_cells(self, msg: Msg) -> None:
        self.execute_code_in_kernel(
            msg,
            f"N_.copy_cells({msg[CONTENT_TAG]!r})",
            kernel_session=self.kernel_session,
            reason=MessageTypes.RUN_CELLS.value,
            skip_input_transformers=True,
        )

    async def sheet_autofill(self, msg: Msg, kernel_session: KernelSession) -> None:
        sheet_drag_formula_content = SheetAutofillContent.from_dict(msg[CONTENT_TAG])
        if sheet_drag_formula_content.autofill_context is None:
            self.execute_code_in_kernel(
                msg,
                f"N_.add_ai_context_to_sheet_autofill_content({msg[CONTENT_TAG]!r})",
                kernel_session=kernel_session or self.kernel_session,
                reason="Get autofill Context",
                skip_input_transformers=True,
            )
            return

        populate_to_start = Address.from_list(
            sheet_drag_formula_content.populate_to_start
        )
        populate_to_end = Address.from_list(sheet_drag_formula_content.populate_to_end)
        populate_from = [
            (Address.from_list(pf.cell_id), pf.content)
            for pf in sheet_drag_formula_content.populate_from
        ]
        context = sheet_drag_formula_content.autofill_context

        changes = None
        if (
            context
            and len(context) >= 2
            and populate_to_end == populate_to_start
            and all(is_number_string(content) for _, content in populate_from)
        ):
            result = await try_codex(context)
            if result is not None:
                func, code = result
                cell_ids = [cell_id.to_a1() for cell_id, _ in populate_from]
                one_line_formula = maybe_inline_code(cell_ids, code)
                if one_line_formula:
                    changes = [(populate_to_start, "=" + one_line_formula)]
                else:
                    changes = [(populate_to_start, f"={func}({', '.join(cell_ids)})")]
                    main_code = self.notebook.code_panel_code() + "\n\n" + code
                    run_notebook_msg = self.default_msg(
                        self.kernel_session, MessageTypes.RUN_CELLS.value
                    )
                    await self.run_notebook_cell(
                        run_notebook_msg,
                        CODEPANEL_CELL_ID,
                        main_code,
                        reason="autofill",
                        replier=None,
                    )

        if (
            changes is None
            and sheet_drag_formula_content.table is not None
            and sheet_drag_formula_content.to_fill is not None
        ):
            table = TableForAI.from_dict(sheet_drag_formula_content.table)
            filled_in = await fill_in_table(sheet_drag_formula_content.to_fill)
            if filled_in:
                changes = []
                for row in Range.from_addresses(populate_to_start, populate_to_end):
                    for cell_addr in row:
                        x = cell_addr.column - table.range.min_col
                        y = cell_addr.row - table.range.min_row
                        changes.append((cell_addr, filled_in[y][x]))

        if changes is None:
            changes = await extend_cells(
                populate_from,
                populate_to_start,
                populate_to_end,
                context=cast(list[Any] | None, context),
            )

        # The round trip to the kernel to get the sheet info means to get undo to work
        # we need to send a message to the kernel with the original message id
        synthetic = copy.deepcopy(msg)
        if MSG_ID_TAG in synthetic[PARENT_HEADER_TAG]:
            synthetic[HEADER_TAG][MSG_ID_TAG] = synthetic[PARENT_HEADER_TAG][MSG_ID_TAG]

        self.update_cell_values(
            synthetic,
            [(add, val, None, None) for add, val in changes],
            MessageTypes.SHEET_AUTOFILL.value,
            kernel_session=kernel_session,
        )

    def change_cell_attribute(self, msg: Msg) -> None:
        self.execute_code_in_kernel(
            msg,
            f"N_.update_cells_attributes({msg[CONTENT_TAG]!r})",
            kernel_session=self.kernel_session,
            reason="Update cell attributes",
            skip_input_transformers=True,
        )

    def call_server_method(
        self,
        msg: Msg,
        method: str,
        args: list[str],
        kwargs: dict[str, Any] | None = None,
        undo: Msg | None = None,
    ) -> None:
        if kwargs:
            params = f"(*{args}, **{kwargs})"
        else:
            params = f"(*{args})"
        if Dash.is_callable_from_client(method):
            code = f"N_.{method}{params}"
        else:
            code = f"client_callable({method}){params}"
        self.execute_code_in_kernel(
            msg,
            code,
            kernel_session=self.kernel_session,
            org_message_type=msg[HEADER_TAG][MSG_TYPE_TAG],
            reason=MessageTypes.RPC_REQUEST.value,
            undo=undo,
            skip_input_transformers=True,
        )

    def add_delete_cells(self, msg: Msg) -> None:
        insert_delete_content = msg[CONTENT_TAG]
        code = f"N_.add_delete_cells({insert_delete_content!r})"
        self.execute_code_in_kernel(
            msg,
            code,
            kernel_session=self.kernel_session,
            org_message_type=msg[HEADER_TAG][MSG_TYPE_TAG],
            reason=MessageTypes.INSERT_DELETE_CELLS.value,
            skip_input_transformers=True,
        )

    def drag_row_column(self, msg: Msg) -> None:
        drag_content = msg[CONTENT_TAG]
        code = f"N_.drag_row_column({drag_content!r})"
        self.execute_code_in_kernel(
            msg,
            code,
            kernel_session=self.kernel_session,
            org_message_type=msg[HEADER_TAG][MSG_TYPE_TAG],
            reason=MessageTypes.DRAG_ROW_COLUMN.value,
            skip_input_transformers=True,
        )

    def widget_triggered(self, msg: Msg) -> None:
        update = WidgetValueContent.from_dict(msg[CONTENT_TAG])
        self.execute_code_in_kernel(
            msg,
            f"N_.widget_triggered({update.cell_id!r}, {update.value!r})",
            kernel_session=self.kernel_session,
            org_message_type=msg[HEADER_TAG][MSG_TYPE_TAG],
            reason=MessageTypes.WIDGET_VALUE_UPDATE.value,
            skip_input_transformers=True,
        )

    def widget_validate_params(self, msg: Msg) -> None:
        validate_widget_params_content = WidgetValidateParamsContent.from_dict(
            msg[CONTENT_TAG]
        )

        # Compile code and params
        compiled_code = validate_widget_params_content.code
        compiled_params = validate_widget_params_content.params
        try:
            compiled_code = expression_compiler.compile_expression(
                validate_widget_params_content.code,
                compute_cells_mentioned=False,
            ).compiled_code

            compiled_params = {
                param: expression_compiler.compile_expression(
                    code,
                    compute_cells_mentioned=False,
                ).compiled_code
                for param, code in validate_widget_params_content.params.items()
            }
        except ValueError:
            pass

        self.execute_code_in_kernel(
            msg,
            f"N_.widget_validate_params({compiled_params}, {compiled_code!r})",
            kernel_session=self.kernel_session,
            reason=MessageTypes.WIDGET_VALIDATE_PARAMS.value,
            skip_input_transformers=True,
        )

    def widget_get_state(self, msg: Msg) -> None:
        widget_get_state_content = WidgetGetStateContent.from_dict(msg[CONTENT_TAG])
        cell_id = widget_get_state_content.cell_id
        cell_id_addr = Address.from_list(cell_id)

        self.execute_code_in_kernel(
            msg,
            f"N_.get_widget_state({cell_id_addr})",
            kernel_session=self.kernel_session,
            reason=MessageTypes.WIDGET_GET_STATE.value,
            skip_input_transformers=True,
        )

    def change_sheet_attribute(self, msg: Msg) -> None:
        self.execute_code_in_kernel(
            self.default_msg(self.kernel_session, msg_type="execute_request"),
            f"N_.update_sheet_attributes({msg[CONTENT_TAG]!r})",
            kernel_session=self.kernel_session,
            reason="Update sheet attributes",
            skip_input_transformers=True,
        )

    def track_msg_done(self, msg: Msg) -> None:
        msg_id = msg[PARENT_HEADER_TAG].get(MSG_ID_TAG)
        if msg_id and (event := self.msg_done_events.get(msg_id)):
            if (
                msg[HEADER_TAG][MSG_TYPE_TAG] == "status"
                and msg[CONTENT_TAG]["execution_state"] == "idle"
            ):
                event.set()
                self.msg_done_events.pop(msg_id)

    def handle_shutdown(self) -> None:
        self.stop_heartbeat()
        self.disconnect()
        self.kernel_client = None

    def create_message_handler(
        self, kernel_client: KernelClient, message_handler: KernelMessageHandler
    ) -> Callable[[Any, MessageList], Awaitable[None]]:
        async def on_message(stream: Any, msg_list: MessageList) -> None:
            try:
                idents, fed_msg_list = kernel_client.session.feed_identities(msg_list)
                msg = kernel_client.session.deserialize(fed_msg_list)

                self.track_msg_done(msg)

                if msg[HEADER_TAG][MSG_TYPE_TAG] == "batch":
                    for unpacked in split_batch_message(msg):
                        await message_handler(stream, unpacked)
                else:
                    await message_handler(stream, msg)
            except Exception:
                # catch-all here because this is a callback, and errors raised appear to kill
                # the kernel connection
                print("Error in kernel reply callback: ", file=sys.stderr)
                traceback.print_exc(file=sys.stderr)

        return on_message

    async def connect_to_kernel(
        self,
        kernel_manager: NeptyneKernelService,
        kernel_name: str,
        message_handler: KernelMessageHandler,
        tyne_info_caller: TyneInfoCaller,
        init_timeout: float = 120.0,
        for_tick: bool = False,
        update_subscriber: Callable[[], None] | None = None,
        load_content: (
            Callable[[], TyneInitializationData | Awaitable[TyneInitializationData]]
            | None
        ) = None,
    ) -> None:
        deadline = time.monotonic() + init_timeout
        async with self.connect_lock:
            if self.kernel_client is not None:
                if update_subscriber:
                    update_subscriber()
                if await self.kernel_client.is_alive():  # type: ignore
                    return
                else:
                    self.log_event(tyne_info_caller, "The kernel restarted", "WARNING")
                    self.kernel_client = None
                    kernel_manager.remove_kernel(self.file_name)

            if for_tick:
                print(
                    f"Connecting to kernel [{self.file_name}] for tick", file=sys.stderr
                )

            connection_file = None
            if self.file_name.startswith("file:"):
                connection_file = self.file_name.removeprefix("file:")

            kernel_client = await self.get_kernel_client(
                kernel_manager,
                kernel_name,
                for_tick,
                connection_file,
            )

            try:
                is_initialized = await check_kernel_init_status(
                    cast(AsyncKernelClient, kernel_client),
                    timeout=deadline - time.monotonic(),
                )
            except TimeoutError as e:
                raise KernelInitTimeout("initial connection") from e

            if not is_initialized:
                with tracer.start_as_current_span("kernel_wait_for_ready"):
                    try:
                        await kernel_client.wait_for_ready()  # type: ignore
                    except RuntimeError:
                        kernel_manager.remove_kernel(self.file_name)

            self.disconnect_channels()

            connect_to = kernel_client.parent
            if not connect_to:
                connect_to = kernel_client.connector()

            for channel in ("shell", "control", "iopub", "stdin"):
                stream_connect = getattr(connect_to, f"connect_{channel}")
                self.channels[channel] = stream = stream_connect(
                    identity=kernel_client.session.bsession
                )
                stream.channel = channel  # Needed by ZMQStreamHandler._on_zmq_reply
                stream.on_recv_stream(
                    self.create_message_handler(kernel_client, message_handler)
                )

            self.stop_heartbeat()
            self.start_heartbeat(kernel_client, tyne_info_caller.handle_kernel_lost)

            self.kernel_client = kernel_client

            try:
                if update_subscriber:
                    update_subscriber()

                if load_content:
                    content = load_content()
                    if inspect.isawaitable(content):
                        content = await content
                    assert isinstance(content, TyneInitializationData)
                    await self._initialize_and_wait(
                        kernel_client,
                        content,
                        deadline - time.monotonic(),
                        tyne_secrets=tyne_info_caller.get_tyne_secrets(),
                    )

                if not await check_kernel_init_status(
                    cast(AsyncKernelClient, kernel_client),
                    timeout=deadline - time.monotonic(),
                ):
                    raise KernelInitTimeout("error initializing kernel")
            except Exception:
                self.stop_heartbeat()
                self.disconnect()
                self.kernel_client = None
                await kernel_manager.shutdown_kernel(self.file_name)
                raise

    def stop_heartbeat(self) -> None:
        if self.heartbeat_task and not self.heartbeat_task.cancelled():
            self.heartbeat_task.cancel()
        self.heartbeat_task = None
        if self.heartbeat_stream:
            self.heartbeat_stream.stop_on_recv()

    def start_heartbeat(
        self, kernel_client: KernelClient, handle_lost: Callable[[], None]
    ) -> None:
        if not kernel_client.parent:
            return
        self.heartbeat_stream = kernel_client.parent.connect_hb()
        assert self.heartbeat_stream
        self.heartbeat_stream.on_recv_stream(self.on_heartbeat)
        self.heartbeat_task = asyncio.create_task(self.heartbeat_loop(handle_lost))

    def on_heartbeat(self, _stream: Any, _msg_list: MessageList) -> None:
        self.last_heartbeat = datetime.now(timezone.utc)
        if (
            self.kernel_client
            and self.kernel_client.parent
            and self.kernel_client.parent.provisioner
            and hasattr(self.kernel_client.parent.provisioner, "set_last_heartbeat")
        ):
            self.kernel_client.parent.provisioner.set_last_heartbeat(
                self.last_heartbeat
            )

    async def heartbeat_loop(self, handle_lost: Callable[[], None]) -> None:
        assert self.heartbeat_stream
        while True:
            self.heartbeat_stream.send(b"ping")
            try:
                await asyncio.sleep(1)
            except CancelledError:
                break
            if self.last_heartbeat is None or self.last_heartbeat < datetime.now(
                timezone.utc
            ) - timedelta(seconds=5):
                handle_lost()
                if self.kernel_client and self.kernel_client.parent:
                    await self.kernel_client.parent.remove_kernel(self.file_name)
                self.disconnect()
                break

    async def interrupt(self) -> None:
        assert self.kernel_client
        if self.kernel_client.parent:
            await self.kernel_client.parent.interrupt_kernel()

    def disconnect_channels(self) -> None:
        if self.channels:
            for channel, stream in self.channels.items():
                if stream is not None and not stream.closed():
                    stream.on_recv(None)
                    stream.close()

    def disconnect(self) -> None:
        self.disconnect_channels()
        if self.kernel_client:
            self.kernel_client.stop_channels()
            self.kernel_client = None

    async def _initialize_and_wait(
        self,
        kernel_client: KernelClient,
        init_data: TyneInitializationData,
        timeout: float,
        tyne_secrets: dict[str, str],
    ) -> None:
        deadline = time.monotonic() + timeout
        try:
            for cell_id, code in init_data.get_init_code():
                await self.execute_and_wait(
                    cell_id or None,
                    code,
                    kernel_client=kernel_client,
                    timeout=deadline - time.monotonic(),
                    reason="init",
                    tyne_secrets=tyne_secrets,
                    skip_input_transformers=not cell_id,
                    user_api_token=None,
                )
        except asyncio.TimeoutError:
            raise KernelInitTimeout("init code")

    async def get_kernel_client(
        self,
        kernel_manager: NeptyneKernelService,
        kernel_name: str,
        for_tick: bool,
        connection_file: str | None,
    ) -> KernelClient:
        kernel_id = self.file_name
        if kernel_id not in kernel_manager.kernels:
            if connection_file:
                return await kernel_manager.connect_to_local_kernel(
                    kernel_id, connection_file
                )
            else:
                with tracer.start_as_current_span("start_kernel") as span:
                    span.set_attribute("kernel_id", kernel_id)
                    await kernel_manager.start_kernel(
                        kernel_id=kernel_id,
                        kernel_name=kernel_name,
                        force_new_pod=for_tick,
                    )

        return kernel_manager.get_kernel(kernel_id).client(context=Context.instance())

    @classmethod
    def from_orm_model(cls, tyne: Tyne) -> "TyneInfo":
        tyne_info = cls(
            file_name=tyne.file_name,
            name=tyne.name,
            version=tyne.version,
        )
        tyne_info.notebook = TyneNotebook(notebook_cells_from_orm_model(tyne))
        tyne_info.tyne_id = tyne.id
        return tyne_info

    def default_msg(
        self,
        kernel_session: KernelSession,
        msg_type: str,
        cell_id: str | None = None,
        *,
        content: dict[str, Any] | None = None,
    ) -> Msg:
        return default_msg(
            self.file_name, kernel_session, msg_type, cell_id, content=content
        )

    def track(self, msg: Msg) -> asyncio.Event:
        event = self.msg_done_events[msg[HEADER_TAG][MSG_ID_TAG]] = asyncio.Event()
        return event

    def execute_code_in_kernel(
        self,
        msg: Msg | None,
        code: str,
        *,
        kernel_session: KernelSession,
        reason: str,
        attributes: dict | None = None,
        org_message_type: str | None = None,
        undo: Msg | None = None,
        store_history: bool = False,
        tyne_secrets: dict[str, str] | None = None,
        skip_input_transformers: bool = False,
        user_api_token: str | None = None,
        user_email: str | None = None,
        session_id: str | None = None,
    ) -> Msg:
        """Run some code in the kernel. Does not wait process for responses"""
        if msg is None:
            msg = self.default_msg(kernel_session, "execute_request")
        content = msg[CONTENT_TAG]
        header = msg[HEADER_TAG]
        if skip_input_transformers:
            content[CODE_TAG] = "N_.exec_header()"
            header[CODE_TAG] = code
        else:
            content[CODE_TAG] = code
            if header.get(CELL_ID_TAG) == CODEPANEL_CELL_ID:
                header[CODE_TAG] = code

        content.setdefault("silent", False)
        content["store_history"] = store_history
        header.setdefault(CELL_ID_TAG, "")
        header[MSG_TYPE_TAG] = "execute_request"

        session = NeptyneSessionInfo.from_message_header(msg.get(PARENT_HEADER_TAG, {}))

        if tyne_secrets is not None:
            session = dataclasses.replace(session, tyne_secrets=tyne_secrets)
        if user_email is not None:
            session = dataclasses.replace(session, user_email=user_email)
        if session_id is not None:
            session = dataclasses.replace(session, session_id=session_id)
        session.write_to_header(header)

        msg[META_DATA_TAG].update(
            {
                "reason": reason,
                "attributes": attributes or {},
            },
        )
        msg["channel"] = "shell"
        stream = self.channels["shell"]
        if org_message_type:
            header[ORG_MSG_TYPE_TAG] = org_message_type
        header["neptyne_reason"] = reason
        if undo:
            header["undo"] = undo

        self.session_send(stream, msg, kernel_session=kernel_session)

        return msg

    async def execute_and_wait(
        self,
        cell_id: str | None,
        code: str,
        *,
        reason: str,
        timeout: float,
        tyne_secrets: dict[str, str] | None,
        kernel_client: KernelClient | None = None,
        skip_input_transformers: bool = False,
        user_api_token: str | None = None,
        user_email: str | None = None,
        session_id: str | None = None,
    ) -> None:
        """Run code in the kernel, and process any responses that come in before the timeout"""
        if kernel_client is None:
            if self.kernel_client is None or "shell" not in self.channels:
                raise ValueError("kernel not connected")
            session = self.kernel_client.session
        else:
            session = kernel_client.session

        with tracer.start_as_current_span("execute_and_wait") as span:
            span.set_attribute("code", code)
            msg = self.default_msg(
                session,
                msg_type="execute_request",
                cell_id=cell_id,
            )
            done_event = self.track(msg)
            self.execute_code_in_kernel(
                msg,
                code,
                kernel_session=session,
                reason=reason,
                tyne_secrets=tyne_secrets,
                skip_input_transformers=skip_input_transformers,
                user_api_token=user_api_token,
                user_email=user_email,
                session_id=session_id,
            )
            try:
                await asyncio.wait_for(done_event.wait(), timeout)
            finally:
                if not done_event.is_set():
                    await self.interrupt()

    def save_cell(self, cell_id: str, code: str, *, is_init_cell: bool) -> None:
        cell_info = self.notebook.get_cell_by_id(cell_id, create_if_missing=True)
        cell_info.raw_code = code
        if cell_info.metadata is None:
            cell_info.metadata = {}
        cell_info.metadata[IS_INIT_CELL_TAG] = is_init_cell

    def send_to_stdin(self, value: Any) -> None:
        self.session_send(
            self.channels["stdin"],
            self.default_msg(
                self.kernel_session,
                "input_reply",
                content={
                    "status": "ok",
                    "value": value,
                },
            ),
        )

    def stream_file(self, file_contents: bytes, file_name: str) -> None:
        contents = base64.b64encode(file_contents).decode("ascii")
        self.send_to_stdin({"bytes": contents, "name": file_name})

    def cancel_stdin(self) -> None:
        self.send_to_stdin({})

    def log_event(
        self,
        replier: TyneInfoCaller,
        message: str,
        severity: str = Severity.INFO.value,
        **extra: dict[str, Any],
    ) -> None:
        event = Event(message=message, severity=Severity(severity), extra=extra)
        self.events.append(event)
        replier.reply(
            None,
            event.export(),
            MessageTypes.LOG_EVENT.value,
        )

    def reload_env(self, parent: Msg | None, variables: dict[str, Any]) -> None:
        self.execute_code_in_kernel(
            parent,
            f"N_.set_env({variables!r})",
            kernel_session=self.kernel_session,
            reason=MessageTypes.RELOAD_ENV.value,
        )

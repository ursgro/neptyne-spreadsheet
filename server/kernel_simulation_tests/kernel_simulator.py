import asyncio
import re
from queue import Empty
from typing import Any, Callable, cast
from unittest import mock

import pytest
from ipykernel.inprocess.blocking import BlockingInProcessStdInChannel
from ipykernel.inprocess.manager import InProcessKernelManager
from jupyter_client.blocking import BlockingKernelClient
from jupyter_client.session import Session
from jupyter_client.utils import run_sync

from neptyne_kernel.cell_address import Address
from neptyne_kernel.dash import Dash
from neptyne_kernel.expression_compiler import Dimension
from neptyne_kernel.json_tools import json_packer
from neptyne_kernel.mime_handling import output_to_value
from neptyne_kernel.neptyne_protocol import (
    CellAttributesUpdate,
    CellAttributeUpdate,
    CellChange,
    DragRowColumnContent,
    InsertDeleteContent,
    MessageTypes,
    MIMETypes,
    RunCellsContent,
    SelectionRect,
    SheetAttributeUpdate,
    SheetTransform,
    WidgetGetStateContent,
    WidgetValidateParamsContent,
    WidgetValueContent,
)
from neptyne_kernel.sheet_api import NeptyneSheetCollection
from neptyne_kernel.tyne_model.cell import SheetCell
from neptyne_kernel.tyne_model.jupyter_notebook import Output
from neptyne_kernel.tyne_model.kernel_init_data import TyneInitializationData
from server.messages import (
    CONTENT_TAG,
    HEADER_TAG,
    MSG_ID_TAG,
    MSG_TYPE_TAG,
    Msg,
    split_batch_message,
)
from server.models import AccessLevel, Tyne
from server.msg_handler_meta import ClientMessageContext
from server.proxied_tyne import ProxiedTyne
from server.tyne_content import TyneContent
from server.tyne_contents_manager import TyneContentsManager

ansi_escape_re = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")


def ansi_escape(text):
    return ansi_escape_re.sub("", text)


def reflate_cell(cell: dict | list) -> dict:
    if isinstance(cell, dict):
        return cell
    if len(cell) == 2:
        cell_id, data = cell
        code = data
    else:
        cell_id, data, code = cell
    return {
        "cellId": cell_id,
        "code": code or "",
        "outputs": [
            {
                "output_type": "execute_result",
                "data": {
                    "application/json": data,
                },
                "metadata": {},
                "execution_count": 1,
            }
        ],
        "attributes": {},
    }


class SimulatorSession(Session):
    def __init__(self, kc: BlockingKernelClient):
        self.kc = kc
        self.org_session = kc.session
        self.sent_count = 0

    def send(self, channel, msg, **kwargs):
        if channel.channel_name == "stdin":
            if msg[CONTENT_TAG]["status"] == "ok":
                self.kc.kernel.raw_input_str = msg[CONTENT_TAG]["value"]
        elif channel.channel_name == "shell":
            self.sent_count += 1
            # Copied from: ipykernel/inprocess/client.py::_dispatch_to_kernel
            kernel = self.kc.kernel
            stream = kernel.shell_stream
            self.org_session.send(
                stream,
                msg,
            )
            msg_parts = stream.recv_multipart()
            loop = asyncio.get_event_loop()
            loop.run_until_complete(kernel.dispatch_shell(msg_parts))
            idents, reply_msg = self.org_session.recv(stream, copy=False)
            self.kc.shell_channel.call_handlers_later(reply_msg)
        else:
            pytest.fail(f"unexpected channel name: {channel.channel_name}")


def print_traceback(error_object):
    try:
        tb = ansi_escape("\n".join(error_object["traceback"]))
    except TypeError:
        tb = str(error_object)
    print(tb)
    return tb


class SimulatedStdInChannel(BlockingInProcessStdInChannel):
    callback: Callable | None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.callback = None

    def call_handlers(self, msg):
        assert self.callback
        if "neptyne_msg_type" in msg["parent_header"]:
            self.callback(msg)
        else:
            super().call_handlers(msg)


class Simulator:
    def __init__(self, session, tyne_store):
        self.run_in_kernel_count = 0
        self.session = session
        self.sessionmaker = lambda: session
        self.tyne_store = tyne_store
        model = run_sync(TyneContentsManager(tyne_store).new_tyne)(
            self.session, user=mock.Mock(tyne_owner_id="neptyne", id=0)
        ).tyne_model
        self.replies_to_client = []
        self.tyne_proxy = ProxiedTyne(model, tyne_store)
        self.tyne_info = self.tyne_proxy.tyne_info
        self.kernel_manager = InProcessKernelManager()
        self.kernel_manager.blocking_class.stdin_channel_class = SimulatedStdInChannel
        self.kernel_manager.start_kernel()
        self.kernel_manager.kernel.session.pack = json_packer

        self.init_and_patch(clear_state=True)
        self.next_repl = 1
        self.expected_rpc_result = None

    def default_msg(
        self,
        msg_type: str,
        cell_id: str | None = None,
        *,
        content: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return self.tyne_info.default_msg(
            self.simulator_session, msg_type, cell_id, content=content
        )

    def client_msg_context(self, msg):
        return ClientMessageContext(msg, None, -1, AccessLevel.EDIT)

    def get_kernel_state(self):
        """Send save request to the kernel and wait until the reply is processed"""
        self.tyne_info.execute_code_in_kernel(
            self.tyne_info.default_msg(
                self.simulator_session, msg_type="execute_request"
            ),
            "N_.save_state()",
            kernel_session=self.simulator_session,
            reason="Save tyne state",
        )

        self.wait_for_kernel()

    def init_and_patch(self, clear_state):
        def no_op(_secs=0.0):
            pass

        self.tyne_proxy.deferred_save = no_op

        self.replies_to_client = []

        def queue_repl(
            original_message: Msg | None,
            reply_content: dict,
            reply_msg_type: str,
            undo: Msg | None = None,
            metadata: dict | None = None,
            header: dict | None = None,
            just_to_self: bool | None = False,
        ):
            self.replies_to_client.append((reply_content, reply_msg_type))

        self.tyne_proxy.reply = queue_repl

        self.kc = self.kernel_manager.client()
        self.kc.start_channels()
        self.kc.stdin_channel.callback = self.on_stdin_msg
        self.kc.wait_for_ready()

        self.tyne_info.kernel_client = self.kc

        self.simulator_session = SimulatorSession(cast(BlockingKernelClient, self.kc))
        self.kc.session = self.simulator_session

        self.tyne_info.channels["shell"] = mock.Mock(channel_name="shell")
        self.tyne_info.channels["stdin"] = mock.Mock(channel_name="stdin")

        self.expected_cells = None

        init_code = [
            "from neptyne_kernel.kernel_init import *",
            "import neptyne_kernel.neptyne_api",
            "N_.sheets._reset_for_testing()",
        ]
        new_dash = [
            "from neptyne_kernel.dash import Dash",
            "Dash._instance = None",
            "N_ = Dash.instance()",
            "neptyne_kernel.neptyne_api.sheets = sheets = N_.sheets",
        ]
        if not clear_state:
            # Reset the sheet before loading new values:
            init_code.extend(new_dash)
        with self.sessionmaker() as session:
            if session.get(Tyne, self.tyne_info.tyne_id):
                content = run_sync(self.tyne_store.load)(
                    self.tyne_info.file_name, session
                )
            else:
                content = TyneContent.empty()
        init_data = TyneInitializationData(
            sheets=content.sheets,
            code_panel_code=(
                content.notebook_cells[0].compiled_code
                if content.notebook_cells
                else ""
            ),
            requirements="",
            requires_recompile=False,
            shard_id=0,
            tyne_file_name=self.tyne_info.file_name,
            in_gs_mode=False,
            gsheets_sheet_id="",
            time_zone="UTC",
            env={},
        )
        for _cell_id, code in init_data.get_init_code():
            init_code.append(code)

        if clear_state:
            # Reset the sheet after loading new values:
            init_code.append("from neptyne_kernel.dash import Dash")
            init_code.extend(new_dash)
            init_code.append(
                "N_.sheets._register_sheet(0, 'Sheet0')",
            )
            init_code.append("N_.initialized = True")

        init_code = "\n".join(init_code)
        self.tyne_info.execute_code_in_kernel(
            self.default_msg(msg_type="execute_request"),
            init_code,
            kernel_session=self.simulator_session,
            reason="init",
        )
        for reply in self.kc.iopub_channel.get_msgs():
            if reply["msg_type"] == "error":
                error_object = reply["content"]
                print_traceback(error_object)
            run_sync(self.tyne_proxy.process_kernel_message)(reply)

    def restart(self):
        self.get_kernel_state()
        self.kernel_manager.restart_kernel()
        self.tyne_proxy = run_sync(TyneContentsManager(self.tyne_store).get)(
            self.tyne_info.file_name,
            self.session,
            user=mock.Mock(tyne_owner_id="neptyne", id=0, organization=None),
        )
        self.tyne_info = self.tyne_proxy.tyne_info
        self.init_and_patch(clear_state=False)

    def stop(self):
        shell = self.get_dash().shell
        for event, fns in shell.events.callbacks.items():
            for fn in fns:
                shell.events.unregister(event, fn)

        self.kernel_manager.shutdown_kernel()

    def on_stdin_msg(self, msg):
        run_sync(self.tyne_proxy.process_kernel_message)(msg)

    def run_cell_counter(self, msg):
        if msg[HEADER_TAG][MSG_TYPE_TAG] == MessageTypes.SHEET_UPDATE.value:
            self.run_in_kernel_count += 1

    def on_run_cell_message(self, reply):
        self.run_cell_counter(reply)
        msg_type = reply[HEADER_TAG][MSG_TYPE_TAG]
        if msg_type == MessageTypes.SHEET_UPDATE.value:
            cell_updates = reply[CONTENT_TAG]["cellUpdates"]
            for update in cell_updates:
                update = reflate_cell(update)
                cell_id = update["cellId"]
                if not isinstance(cell_id, Address):
                    cell_id = Address(*cell_id)
                self.expected_cells.discard(cell_id)
                if update["outputs"] is not None:
                    for output in update["outputs"]:
                        if (
                            k := MIMETypes.APPLICATION_VND_NEPTYNE_ERROR_V1_JSON.value
                        ) in output["data"]:
                            print_traceback(output["data"][k])

    @staticmethod
    def gen_validate_rpc_result_fn(expected_result, match_result_keys=False):
        def fn(reply):
            msg_type = reply[HEADER_TAG][MSG_TYPE_TAG]
            if msg_type == MessageTypes.RPC_RESULT.value:
                if match_result_keys:
                    assert set(expected_result) == set(
                        reply[CONTENT_TAG]["result"].keys()
                    )
                else:
                    assert expected_result == reply[CONTENT_TAG]["result"]

        return fn

    def wait_for_kernel(
        self,
        verbose=False,
        message_processor=None,
    ) -> Msg | None:
        undo_msg: Msg | None = None
        idle_count = 0
        busy_count = 0
        for i in range(100):
            idle = 0 < busy_count <= idle_count
            try:
                # If we've transitioned to "idle", only process anything that is available
                # immediately
                timeout = 0 if idle else 1
                reply = self.kc.iopub_channel.get_msg(timeout=timeout)
            except Empty:
                if idle:
                    for msg in self.kc.shell_channel.get_msgs():
                        if verbose:
                            print(
                                msg[HEADER_TAG][MSG_TYPE_TAG],
                                msg[HEADER_TAG][MSG_ID_TAG],
                                (
                                    msg["content"]["data"].keys()
                                    if msg[HEADER_TAG][MSG_TYPE_TAG] == "display_data"
                                    else msg["content"]
                                ),
                            )
                    break
            else:
                if verbose:
                    print(
                        reply[HEADER_TAG][MSG_TYPE_TAG],
                        reply[HEADER_TAG][MSG_ID_TAG],
                        (
                            reply["content"]["data"].keys()
                            if reply[HEADER_TAG][MSG_TYPE_TAG] == "display_data"
                            else reply["content"]
                        ),
                    )
                msg_type = reply[HEADER_TAG][MSG_TYPE_TAG]
                if msg_type == "batch":
                    for m in split_batch_message(reply):
                        run_sync(self.tyne_proxy.process_kernel_message)(m)
                else:
                    run_sync(self.tyne_proxy.process_kernel_message)(reply)
                undo_msg = reply.get("metadata", {}).get("undo") or undo_msg
                if msg_type == "error":
                    traceback_error = print_traceback(reply[CONTENT_TAG])
                    raise RuntimeError(traceback_error)
                elif msg_type == "stream" and reply["content"]["name"] == "stderr":
                    print(reply["content"]["text"])
                    # raise RuntimeError("Error returned in stream")  - this seems to happen randomly?
                elif msg_type == "status":
                    execution_state = reply["content"]["execution_state"]
                    if execution_state == "idle":
                        idle_count += 1
                    elif execution_state == "busy":
                        busy_count += 1
                if message_processor:
                    message_processor(reply)
        else:
            pytest.fail(
                "Waited too long for kernel to become idle. "
                "Possible infinite loop or recursion?"
            )
        return undo_msg

    def run_cell(
        self,
        cell_id_str,
        code,
        *,
        expected_cells=None,
        verbose=False,
        patch_msg=None,
        for_ai=False,
        sheet_id: int = 0,
    ) -> Msg | None:
        undo: Msg | None = None
        self.simulator_session.sent_count = 0
        if isinstance(cell_id_str, str):
            notebook_cell = cell_id_str.startswith("0")
            if not notebook_cell:
                cell_id = Address.from_a1_or_str(cell_id_str, sheet_id)
            else:
                cell_id = cell_id_str
        else:
            assert isinstance(cell_id_str, Address)
            notebook_cell = False
            cell_id = cell_id_str
        msg = self.default_msg(
            MessageTypes.RUN_CELLS.value,
            content=RunCellsContent(
                current_sheet=0,
                to_run=[
                    CellChange(
                        attributes=None,
                        cell_id=(
                            cell_id.to_float_coord()
                            if isinstance(cell_id, Address)
                            else cell_id
                        ),
                        content=code,
                        mime_type=None,
                    )
                ],
                notebook=notebook_cell,
                for_ai=for_ai,
                gs_mode=False,
                ai_tables=None,
                current_sheet_name="Sheet0",
                sheet_ids_by_name={"Sheet0": 0},
            ).to_dict(),
        )
        if patch_msg:
            patch_msg(msg)

        run_sync(self.tyne_info.run_cells)(
            msg, replier=self.tyne_proxy, kernel_session=self.simulator_session
        )

        if expected_cells is not None:
            self.expected_cells = {
                Address.from_a1(cell)
                for cell in expected_cells
                if not cell.startswith("0")
            }
        else:
            self.expected_cells = {cell_id}

        if not notebook_cell:
            undo = self.wait_for_kernel(
                verbose=verbose, message_processor=self.on_run_cell_message
            )
            assert (
                self.expected_cells == set()
            ), f"{', '.join(c.to_a1() for c in self.expected_cells)} did not update"
        return undo

    def set_sheet_attribute(
        self,
        sheet_id,
        attribute,
        value,
    ):
        msg = self.tyne_info.default_msg(
            self.kc.session,
            MessageTypes.CHANGE_SHEET_ATTRIBUTE.value,
            content=SheetAttributeUpdate(
                attribute=attribute,
                value=value,
                sheet_id=sheet_id,
            ).to_dict(),
        )
        self.tyne_info.change_sheet_attribute(msg)

        undo = self.wait_for_kernel()
        return undo

    def set_cell_attribute(self, address, attribute, value, sheet_id=0):
        msg = self.tyne_info.default_msg(
            self.kc.session,
            MessageTypes.CHANGE_CELL_ATTRIBUTE.value,
            content=CellAttributesUpdate(
                updates=[
                    CellAttributeUpdate(
                        attribute=attribute,
                        cell_id=address.to_float_coord(),
                        value=value,
                    )
                ],
            ).to_dict(),
        )
        self.tyne_info.change_cell_attribute(msg)

        undo = self.wait_for_kernel()
        return undo

    def repl_command(self, code, verbose=False, for_ai=False):
        self.run_cell(f"0{self.next_repl}", code, for_ai=for_ai)
        self.next_repl += 1
        self.wait_for_kernel(verbose=verbose)

    def last_repl_output(self, key: str = "text/plain") -> Any:
        return self.tyne_info.notebook.cells[-1].outputs[0].data[key]

    def set_code_pane(self, code):
        self.run_cell("00", code)

    def get_code_pane(self):
        return self.tyne_info.notebook.code_panel_code()

    def call_server_function(self, method, params):
        msg = self.tyne_info.default_msg(
            self.kc.session,
            MessageTypes.RPC_REQUEST.value,
        )
        self.tyne_info.call_server_method(msg, method, [], params)

        for tries in range(30):
            replies = self.kc.iopub_channel.get_msgs()
            if not replies:
                break
            for reply in replies:
                if reply[HEADER_TAG][MSG_TYPE_TAG] == MessageTypes.RPC_RESULT.value:
                    return reply[CONTENT_TAG]["result"]
        return None

    def get_dash(self) -> Dash:
        return self.kc.kernel.shell.user_ns["N_"]

    def get_sheets(self) -> NeptyneSheetCollection:
        return self.get_dash().sheets

    def get_sheet_size(self, sheet_id: int):
        dash_sheet = self.get_dash().sheets[sheet_id]
        return dash_sheet.n_cols, dash_sheet.n_rows

    def get_sheet_attribute(self, sheet_id: int, attribute: str):
        return self.get_dash().sheets[sheet_id].attributes[attribute]

    def get_cell(self, cell_id) -> SheetCell:
        if isinstance(cell_id, str):
            if "!" in cell_id:
                sheet_name, cell_id = cell_id.split("!", 1)
                sheet_id = self.get_sheets()[sheet_name].sheet_id
            else:
                sheet_id = 0
            cell_id = Address.from_a1_or_str(cell_id, sheet_id)
        dash = self.get_dash()
        dash.graph.check_integrity()
        return dash.sheet_cell_for_address(cell_id)

    def get(self, cell_id):
        cell = self.get_cell(cell_id)
        if cell is None or cell.output is None:
            return None
        if isinstance(cell.output, Output):
            output_data = cell.output.data
            return output_to_value(output_data)
        return cell.output

    def run_add_delete(
        self,
        sheet_transform: SheetTransform,
        dimension: Dimension,
        selected_index: float,
        cells_to_populate: dict[str, Any] | None = None,
        amount: int = 1,
        sheet_id: int = 0,
        boundary: SelectionRect | None = None,
    ) -> Msg | None:
        content = InsertDeleteContent(
            amount,
            boundary,
            cells_to_populate,
            dimension,
            selected_index,
            sheet_id,
            sheet_transform,
        )
        msg = self.default_msg(
            MessageTypes.INSERT_DELETE_CELLS.value,
            content=content.to_dict(),
        )
        run_sync(self.tyne_proxy.handle_client_message)(self.client_msg_context(msg))
        return self.wait_for_kernel(
            verbose=True, message_processor=self.run_cell_counter
        )

    def drag_row_column(self, content: DragRowColumnContent):
        msg = self.default_msg(
            MessageTypes.DRAG_ROW_COLUMN.value,
            content=content.to_dict(),
        )
        run_sync(self.tyne_proxy.handle_client_message)(self.client_msg_context(msg))
        return self.wait_for_kernel(verbose=True)

    def get_attribute(self, cell_id: str, attribute: str) -> Any | None:
        return self.get_cell(cell_id).attributes.get(attribute)

    def undo(self, undo: Msg):
        assert undo is not None
        run_sync(self.tyne_proxy.handle_client_message)(self.client_msg_context(undo))
        self.wait_for_kernel()

    def trigger_widget_event(self, cell_id: str, value: float | str | None = None):
        msg = self.tyne_info.default_msg(
            self.kc.session,
            MessageTypes.WIDGET_VALUE_UPDATE.value,
            content=WidgetValueContent(cell_id=cell_id, value=value).to_dict(),
        )
        run_sync(self.tyne_proxy.handle_client_message)(self.client_msg_context(msg))

    def get_widget_state(self, cell_id: str, expected_state: dict[str, Any]):
        cell_address = Address.from_a1(cell_id)
        addr_list = cell_address.to_float_coord()
        content = WidgetGetStateContent(cell_id=addr_list)
        msg = self.default_msg(
            MessageTypes.WIDGET_GET_STATE.value,
            content=content.to_dict(),
        )
        run_sync(self.tyne_proxy.handle_client_message)(
            self.client_msg_context(msg),
        )
        self.wait_for_kernel(
            message_processor=self.gen_validate_rpc_result_fn(expected_state)
        )

    def validate_widget_params(
        self, code: str, params: dict[str, str], expected_state: dict[str, str]
    ):
        content = WidgetValidateParamsContent(code=code, params=params)
        msg = self.default_msg(
            MessageTypes.WIDGET_VALIDATE_PARAMS.value,
            content=content.to_dict(),
        )
        run_sync(self.tyne_proxy.handle_client_message)(
            self.client_msg_context(msg),
        )
        self.wait_for_kernel(
            message_processor=self.gen_validate_rpc_result_fn(expected_state, True)
        )

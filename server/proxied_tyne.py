import asyncio
import base64
import copy
import inspect
import logging
import random
import time
from asyncio import Task
from collections.abc import Awaitable
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any, Callable, Iterator

from jupyter_client import KernelClient
from jupyter_client.session import Session as KernelSession
from opentelemetry import trace
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from neptyne_kernel.cell_address import is_notebook_cell, is_sheet_cell
from neptyne_kernel.cell_api import set_cell_api_completion_matches
from neptyne_kernel.neptyne_protocol import (
    CallServerContent,
    DeleteSheetContent,
    InsertDeleteReplyCellType,
    InstallRequirementsContent,
    MessageTypes,
    RenameSheetContent,
    RenameTyneContent,
    RerunCellsContent,
    RunCellsContent,
    SetSecretsContent,
    TickReplyContent,
    TynePropertyUpdateContent,
    TynePropertyUpdateContentChange,
)
from neptyne_kernel.proxied_apis import get_api_error_service
from neptyne_kernel.session_info import NeptyneSessionInfo
from neptyne_kernel.transformation import Transformation
from neptyne_kernel.tyne_model.cell import CODEPANEL_CELL_ID, NotebookCell
from neptyne_kernel.tyne_model.kernel_init_data import TyneInitializationData
from server.image_upload import decode_image, upload_image_to_gcs
from server.messages import (
    CELL_ID_TAG,
    CODE_TAG,
    CONTENT_TAG,
    HEADER_TAG,
    IS_INIT_CELL_TAG,
    META_DATA_TAG,
    MSG_ID_TAG,
    MSG_TYPE_TAG,
    PARENT_HEADER_TAG,
    SHEET_ID_TAG,
    Msg,
    cell_or_range_for_completion,
    default_msg,
    split_batch_message,
)
from server.models import AccessLevel, Notebook, Tyne, TyneSecrets
from server.msg_handler_meta import (
    ClientMessageContext,
    MessageHandler,
    client_message_handler,
    kernel_message_handler,
)
from server.neptyne_kernel_service import NeptyneKernelService
from server.tracing import extract_trace_context
from server.tyne_content import trim_notebook_cells
from server.tyne_info import (
    KernelSubscriber,
    TyneInfo,
    TyneInfoCaller,
)
from server.tyne_storer import TyneStorer, blob_to_sheets

logger = logging.getLogger("kernelLogger")
tracer = trace.get_tracer(__name__)

IDLE_SAVE_WAIT = 9
DASH_METADATA_TTL = 3


class SaveError(Exception):
    pass


def deserialize_and_split(kernel_client: KernelClient, msg_list: Any) -> Iterator[Msg]:
    idents, fed_msg_list = kernel_client.session.feed_identities(msg_list)
    msg = kernel_client.session.deserialize(fed_msg_list)

    if msg[HEADER_TAG][MSG_TYPE_TAG] == "batch":
        yield from split_batch_message(msg)
    else:
        yield msg


class TyneProxyError(Exception):
    pass


class ProxiedTyne(TyneInfoCaller, MessageHandler):
    """Provisions remote kernels & tynes, either locally or in kubernetes. Handles messaging to
    tyne users and database persistence."""

    tyne_storer: TyneStorer
    kernel_name: str
    user_secrets: dict[int | None, dict[str, str]]
    kernel_subscribers: dict[str, KernelSubscriber]
    kernel_initialized: asyncio.Event
    last_user_activity: float
    deferred_save_task: Task | None
    deferred_save_error: Exception | None
    save_events: dict[str, asyncio.Event]
    tyne_owner_email: str | None
    gsheet_id: str | None
    dash_metadata: dict[str, Any]
    dash_metadata_update_time: float
    callback_tasks: set[Task]

    tyne_info: TyneInfo

    fake_zmq_stream = SimpleNamespace(closed=lambda: False, channel="iopub")

    ticking: bool

    def __init__(
        self,
        tyne: Tyne,
        tyne_storer: TyneStorer,
        kernel_name: str = "python_local",
    ):
        self.tyne_info = TyneInfo.from_orm_model(tyne)
        self.tyne_storer = tyne_storer
        self.kernel_name = kernel_name
        self.user_secrets = {}
        self.kernel_subscribers = {}
        self.kernel_initialized = asyncio.Event()
        self.last_user_activity = 0
        self.deferred_save_task = None
        self.deferred_save_error = None
        self.save_events = {}
        self.ticking = False
        self.gsheet_id = tyne.google_sheet.sheet_id if tyne.google_sheet else None
        self.dash_metadata = (
            tyne.properties.get("dash_metadata", {}) if tyne.properties else {}
        )
        self.dash_metadata_update_time = 0
        self.callback_tasks = set()

        if (tyne_owner := tyne.tyne_owner) and (user := tyne_owner.user):
            self.tyne_owner_email = user.email
        else:
            self.tyne_owner_email = None

    @property
    def kernel_session(self) -> KernelSession:
        return self.tyne_info.kernel_session

    def kernel_state_saving(self) -> None:
        self.reply(None, {}, MessageTypes.TYNE_SAVING.value)

    def kernel_state_saved(self) -> None:
        self.reply(None, {}, MessageTypes.TYNE_SAVED.value)

    def cleanup_callback_tasks(self) -> None:
        self.callback_tasks = {task for task in self.callback_tasks if not task.done()}

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
        """Broadcast a response on iopub, and send an undo message to the original requester"""
        self.cleanup_callback_tasks()
        reply = self.default_msg(
            self.kernel_session,
            reply_msg_type,
            content=reply_content,
        )
        if header:
            reply[HEADER_TAG].update(header)
        if original_message and original_message[HEADER_TAG].get(MSG_ID_TAG):
            reply[PARENT_HEADER_TAG][MSG_ID_TAG] = original_message[HEADER_TAG][
                MSG_ID_TAG
            ]
        reply["channel"] = "iopub"
        reply["buffers"] = []

        if metadata is not None:
            reply[META_DATA_TAG] = metadata

        session_id = (
            NeptyneSessionInfo.from_message_header(
                original_message[HEADER_TAG]
            ).session_id
            if original_message
            else None
        )

        if not just_to_self:
            for subscriber_id, subscriber in [*self.kernel_subscribers.items()]:
                if subscriber_id != session_id:
                    if inspect.iscoroutinefunction(subscriber.on_kernel_msg):
                        loop = asyncio.get_event_loop()
                        self.callback_tasks.add(
                            loop.create_task(
                                subscriber.on_kernel_msg(self.fake_zmq_stream, reply)
                            )
                        )
                    else:
                        subscriber.on_kernel_msg(self.fake_zmq_stream, reply)

        if session_id in self.kernel_subscribers:
            # Send undo only to self
            self_reply = copy.deepcopy(reply)
            if undo:
                self_reply.setdefault(META_DATA_TAG, {})["undo"] = undo
            if inspect.iscoroutinefunction(
                self.kernel_subscribers[session_id].on_kernel_msg
            ):
                loop = asyncio.get_event_loop()
                self.callback_tasks.add(
                    loop.create_task(
                        self.kernel_subscribers[session_id].on_kernel_msg(
                            self.fake_zmq_stream, self_reply
                        )
                    )
                )
            else:
                self.kernel_subscribers[session_id].on_kernel_msg(
                    self.fake_zmq_stream, self_reply
                )

    async def handle_client_message(self, context: ClientMessageContext) -> None:
        msg = context.msg
        message_header = msg[HEADER_TAG]
        message_type = message_header[MSG_TYPE_TAG]

        if (
            context.access_level != AccessLevel.EDIT
            and message_type != "kernel_info_request"
        ):
            return None

        for meta_tag in SHEET_ID_TAG, CELL_ID_TAG:
            value = msg[META_DATA_TAG].get(meta_tag)
            if value:
                msg[HEADER_TAG][meta_tag] = value
        self.last_user_activity = time.time()

        handler = self.get_handler(("client", message_type))
        if not handler:
            return self.on_client_default(msg)

        if inspect.iscoroutinefunction(handler):
            await handler(context)
        else:
            handler(context)

    def send_stdin(self, msg: Msg) -> None:
        self.tyne_info.session_send(self.tyne_info.channels["stdin"], msg)

    async def connect_to_kernel(
        self,
        kernel_manager: NeptyneKernelService,
        load_content: Callable[
            [], TyneInitializationData | Awaitable[TyneInitializationData]
        ],
        *,
        session_id: str | None,
        subscriber: KernelSubscriber | None,
        timeout: float = 120.0,
        for_tick: bool = False,
    ) -> None:
        update_subscriber: Callable[[], None] | None
        if session_id and subscriber:

            def update_subscriber() -> None:
                assert session_id
                self.update_kernel_subscriber(session_id, subscriber)

        else:
            update_subscriber = None

        await self.tyne_info.connect_to_kernel(
            kernel_manager,
            self.kernel_name,
            self.on_kernel_message,
            self,
            timeout,
            update_subscriber=update_subscriber,
            load_content=load_content,
            for_tick=for_tick,
        )

        if session_id:
            msg = self.default_msg(
                self.kernel_session,
                MessageTypes.SAVE_KERNEL_STATE.value,
                content={},
            )
            NeptyneSessionInfo(session_id=session_id).write_to_header(msg[HEADER_TAG])
            self.tyne_info.execute_code_in_kernel(
                msg,
                f"N_.save_state(for_client={session_id!r})",
                kernel_session=self.tyne_info.kernel_session,
                reason="Kernel state for client",
            )

    def update_kernel_subscriber(
        self, session_id: str, subscriber: KernelSubscriber | None
    ) -> None:
        if subscriber is None:
            if session_id in self.kernel_subscribers:
                del self.kernel_subscribers[session_id]
        else:
            self.kernel_subscribers[session_id] = subscriber
        self.reply(
            None,
            {
                "subscribers": [
                    sub.to_json() for sub in self.kernel_subscribers.values()
                ]
            },
            str(MessageTypes.SUBSCRIBERS_UPDATED.value),
        )

    def default_msg(
        self,
        kernel_session: KernelSession,
        msg_type: str,
        *,
        content: dict[str, Any] | None = None,
    ) -> Msg:
        return default_msg(
            self.tyne_info.file_name,
            kernel_session,
            msg_type,
            content=content,
        )

    def disconnect(self) -> None:
        self.tyne_info.disconnect()

    def disconnect_clients(self) -> None:
        for subscriber in self.kernel_subscribers.values():
            subscriber.close()
        self.kernel_subscribers = {}

    def prepare_for_shutdown(self, event: asyncio.Event) -> None:
        self.disconnect_clients()
        if self.deferred_save_task:
            self.deferred_save_task.cancel()
        if self.tyne_info.kernel_client:
            self.trigger_save(event)

    async def on_kernel_message(self, stream: Any, msg: Msg) -> None:
        ctx = extract_trace_context(msg)
        with tracer.start_as_current_span(
            "process_kernel_message", context=ctx
        ) as span:
            span.set_attribute("tyne_file_name", self.tyne_info.file_name)
            span.set_attribute("msg_type", msg[HEADER_TAG][MSG_TYPE_TAG])
            patched_msg = await self.process_kernel_message(msg)
        now = datetime.now(timezone.utc)

        if receive_at := msg[PARENT_HEADER_TAG].get("server_receive_at"):
            duration = now - receive_at
            if patched_msg is not None:
                patched_msg[HEADER_TAG]["server_duration"] = duration.total_seconds()

        session_id = NeptyneSessionInfo.from_message_header(
            msg[PARENT_HEADER_TAG]
        ).session_id
        NeptyneSessionInfo.strip_from_message_header(msg[PARENT_HEADER_TAG])

        did_send_to_subscriber = False
        if patched_msg is not None:
            if (
                stream.channel == "iopub"
                # we give special treatment to execute_reply messages so all subscribers know
                # when a cell has finished executing
                or patched_msg[HEADER_TAG][MSG_TYPE_TAG] == "execute_reply"
            ):
                for subscriber in self.kernel_subscribers.values():
                    if inspect.iscoroutinefunction(subscriber.on_kernel_msg):
                        await subscriber.on_kernel_msg(stream, patched_msg)
                    else:
                        subscriber.on_kernel_msg(stream, patched_msg)
                    did_send_to_subscriber = True
            else:
                if session_id and (sub := self.kernel_subscribers.get(session_id)):
                    if inspect.iscoroutinefunction(sub.on_kernel_msg):
                        await sub.on_kernel_msg(stream, patched_msg)
                    else:
                        sub.on_kernel_msg(stream, patched_msg)
                    did_send_to_subscriber = True

            if (
                not did_send_to_subscriber
                and patched_msg[HEADER_TAG][MSG_TYPE_TAG] == "input_request"
            ):
                # If the kernel requests input but there is no subscriber listening, it will be stuck.
                # Un-stick it by sending an empty input.
                self.tyne_info.send_to_stdin(None)

        # Handle shutdown after broadcasting message, so we get a chance to write to the websocket
        # before we close it
        if msg[PARENT_HEADER_TAG].get(MSG_TYPE_TAG) == "shutdown_request":
            self.tyne_info.handle_shutdown()

    async def tick(
        self,
        load_content: Callable[
            [], TyneInitializationData | Awaitable[TyneInitializationData]
        ],
        kernel_manager: NeptyneKernelService,
    ) -> None:
        if not self.ticking:
            try:
                self.ticking = True
                await self.connect_to_kernel(
                    kernel_manager,
                    load_content,
                    session_id=None,
                    subscriber=None,
                    for_tick=True,
                )
            finally:
                self.ticking = False

    def set_user_secret(
        self, user_id: int, session: Session, key: str, value: str
    ) -> None:
        assert self.tyne_info.tyne_id is not None
        rows = (
            session.query(TyneSecrets)
            .filter(
                user_id == TyneSecrets.user_id,
                self.tyne_info.tyne_id == TyneSecrets.tyne_id,
            )
            .all()
        )
        if rows:
            record = rows[0]
        else:
            record = TyneSecrets()
            record.tyne_id = self.tyne_info.tyne_id
            record.user_id = user_id
            record.values = {}

        record.values = {**record.values, key: value}
        session.add(record)
        session.commit()
        self.load_user_secrets(user_id, session)

    def get_user_secrets(self, user_id: int | None) -> dict[str, str]:
        return self.user_secrets.get(user_id, {})

    def get_tyne_secrets(self) -> dict[str, str]:
        return self.get_user_secrets(None)

    def handle_kernel_lost(self) -> None:
        self.disconnect_clients()

    async def save_notebook(self) -> None:
        await self.tyne_storer.decode_and_save(
            self.tyne_info.file_name,
            sheets_blob=None,
            sheets_blob_version=None,
            notebook_cells=self.get_notebook_cells_for_save(),
            events=self.tyne_info.events,
            min_next_tick=0,
        )

    def load_user_secrets(self, user_id: int | None, session: Session) -> None:
        secrets = session.execute(
            select(TyneSecrets.values)
            .join(TyneSecrets.tyne)
            .where(
                Tyne.file_name == self.tyne_info.file_name,
                user_id == TyneSecrets.user_id,
            )
        ).all()

        if secrets:
            self.user_secrets[user_id] = {k: str(v) for k, v in secrets[0][0].items()}

    def set_user_secrets(
        self, user_id: int | None, session: Session, secrets: dict[str, str]
    ) -> None:
        rows = (
            session.query(TyneSecrets)
            .filter(
                user_id == TyneSecrets.user_id,
                self.tyne_info.tyne_id == TyneSecrets.tyne_id,
            )
            .all()
        )
        if rows:
            record = rows[0]
        else:
            record = TyneSecrets()
            record.tyne_id = self.tyne_info.tyne_id
            record.user_id = user_id

        record.values = secrets
        session.add(record)
        session.commit()
        if secrets:
            self.user_secrets[user_id] = {**secrets}

    @client_message_handler(MessageTypes.RENAME_TYNE)
    def rename_tyne(self, context: ClientMessageContext) -> None:
        msg = context.msg
        session = context.session
        rename_content = RenameTyneContent.from_dict(msg[CONTENT_TAG])

        self.tyne_info.name = rename_content.name

        session.execute(
            update(Tyne)
            .where(Tyne.id == self.tyne_info.tyne_id)
            .values(name=rename_content.name)
        )
        session.commit()

        self.reply(msg, rename_content.to_dict(), msg[HEADER_TAG][MSG_TYPE_TAG])

    @client_message_handler(MessageTypes.INSTALL_REQUIREMENTS)
    def install_requirements(self, context: ClientMessageContext) -> None:
        msg = context.msg
        session = context.session
        content = InstallRequirementsContent.from_dict(msg[CONTENT_TAG])
        requirements = content.requirements

        session.execute(
            update(Notebook)
            .where(Notebook.tyne_id == self.tyne_info.tyne_id)
            .values(requirements=requirements)
        )
        session.commit()

        self.tyne_info.execute_code_in_kernel(
            msg,
            f"N_.pip_install({requirements!r})",
            kernel_session=self.kernel_session,
            reason=MessageTypes.INSTALL_REQUIREMENTS.value,
        )
        self.reply(
            msg,
            content.to_dict(),
            reply_msg_type=MessageTypes.INSTALL_REQUIREMENTS.value,
        )

    @client_message_handler(MessageTypes.TYNE_PROPERTY_UPDATE)
    def tyne_property_update(self, context: ClientMessageContext) -> None:
        msg = context.msg
        session = context.session
        undo = copy.deepcopy(msg)
        reply_content = msg[CONTENT_TAG]

        tyne = (
            session.query(Tyne)
            .filter(
                Tyne.id == self.tyne_info.tyne_id,
            )
            .first()
        )

        tyne.properties = tyne.properties or {}
        update = TynePropertyUpdateContent.from_dict(msg[CONTENT_TAG])
        prev_value = [
            TynePropertyUpdateContentChange(
                change.property, tyne.properties.get(change.property)
            )
            for change in update.changes
        ]
        for change in update.changes:
            if change.value is None:
                if change.property in tyne.properties:
                    del tyne.properties[change.property]
            else:
                tyne.properties[change.property] = change.value

        flag_modified(tyne, "properties")
        session.add(tyne)
        session.commit()

        undo[CONTENT_TAG].update(TynePropertyUpdateContent(prev_value).to_dict())

        self.reply(
            msg,
            reply_content,
            reply_msg_type=MessageTypes.TYNE_PROPERTY_UPDATE.value,
            undo=undo,
        )

    def stream_file(self, file_contents: bytes, file_name: str) -> None:
        self.tyne_info.stream_file(file_contents, file_name)

    def cancel_stdin(self) -> None:
        self.tyne_info.cancel_stdin()

    def trigger_save(self, event: asyncio.Event | None = None) -> None:
        self.kernel_state_saving()
        msg = self.tyne_info.execute_code_in_kernel(
            None,
            "N_.save_state()",
            kernel_session=self.tyne_info.kernel_session,
            reason=MessageTypes.SAVE_KERNEL_STATE.value,
        )
        if event:
            msg_id = msg[HEADER_TAG]["msg_id"]
            self.save_events[msg_id] = event

    @client_message_handler(MessageTypes.SAVE_TYNE)
    def on_save_msg(self, context: ClientMessageContext) -> None:
        self.deferred_save()

    def deferred_save(self, wait_seconds: float = 0.0) -> None:
        if self.deferred_save_error:
            e = self.deferred_save_error
            self.deferred_save_error = None
            raise SaveError("Error saving the tyne") from e

        if self.deferred_save_task:
            return

        async def trigger_save(t: float) -> None:
            try:
                await asyncio.sleep(t)
            except asyncio.CancelledError:
                return
            self.trigger_save(None)

        self.deferred_save_task = asyncio.create_task(trigger_save(wait_seconds))

    def cancel_deferred_save(self) -> None:
        if self.deferred_save_task:
            self.deferred_save_task.cancel()
            self.deferred_save_task = None

    async def process_kernel_message(self, msg: Msg) -> Msg | None:
        """Update the tyne state according to the message. Modifies and returns 'msg'"""

        parent = msg[PARENT_HEADER_TAG]
        msg_type = msg[HEADER_TAG][MSG_TYPE_TAG]

        if (
            msg_type == "status"
            and parent.get("neptyne_reason", "") != MessageTypes.SAVE_KERNEL_STATE.value
        ):
            execution_state = msg[CONTENT_TAG].get("execution_state")
            if execution_state == "idle":
                self.deferred_save(IDLE_SAVE_WAIT)
            elif execution_state == "busy":
                self.cancel_deferred_save()

        if handler := self.get_handler(("kernel", msg_type)):
            res = handler(msg)
            if inspect.isawaitable(res):
                msg = await res
            else:
                msg = res

        if msg is None:
            return None

        if CELL_ID_TAG in msg[META_DATA_TAG]:
            cell_id = msg[META_DATA_TAG][CELL_ID_TAG]
        else:
            cell_id = parent.get(CELL_ID_TAG)
            if cell_id:
                msg[META_DATA_TAG][CELL_ID_TAG] = cell_id

        if isinstance(cell_id, str) and is_notebook_cell(cell_id):
            nb_cell = self.tyne_info.notebook.get_cell_by_id(cell_id)
            msg[CONTENT_TAG]["cell"] = nb_cell.export(omit_outputs=True)

        return msg

    def get_notebook_cells_for_save(self) -> list[NotebookCell]:
        """Return notebook cells that should be saved to db"""
        return trim_notebook_cells(self.tyne_info.notebook.cells)

    async def save_kernel_state(self, msg: Msg) -> None:
        # Merge kernel + tyne_info state and save to db
        try:
            if (
                not self.last_user_activity
                or time.time() - self.last_user_activity > 15 * 60
            ):
                min_next_tick = 15 * 60 + random.randint(-60, 60)
            else:
                min_next_tick = 0
            await self.tyne_storer.decode_and_save(
                self.tyne_info.file_name,
                sheets_blob=base64.b64decode(msg[CONTENT_TAG]["bytes"]),
                sheets_blob_version=msg[CONTENT_TAG].get("version"),
                notebook_cells=self.get_notebook_cells_for_save(),
                events=self.tyne_info.events,
                min_next_tick=min_next_tick,
            )
            if event := self.save_events.pop(msg[PARENT_HEADER_TAG]["msg_id"], None):
                event.set()
            self.kernel_state_saved()
        except Exception as e:
            logger.exception(
                "Error saving kernel state for %s", self.tyne_info.file_name
            )
            self.deferred_save_error = e

    def send_tyne_state_to_client(self, msg: Msg) -> None:
        NeptyneSessionInfo.from_message_header(msg[PARENT_HEADER_TAG]).write_to_header(
            msg[HEADER_TAG]
        )
        sheets_blob = base64.b64decode(msg[CONTENT_TAG]["bytes"])
        sheets_blob_version = msg[CONTENT_TAG].get("version")
        sheets, next_tick = blob_to_sheets(sheets_blob, sheets_blob_version)
        assert sheets
        self.reply(
            msg,
            {
                "sheets": sheets.export(compact=True),
                "notebooks": [
                    {
                        "cells": [
                            cell.export() for cell in self.get_notebook_cells_for_save()
                        ]
                    }
                ],
                "events": [e.export() for e in self.tyne_info.events],
            },
            MessageTypes.SAVE_KERNEL_STATE.value,
            just_to_self=True,
        )

    @client_message_handler(MessageTypes.RUN_CELLS)
    async def on_run_cells_client(self, context: ClientMessageContext) -> None:
        await self.tyne_info.run_cells(context.msg, self)

    async def on_run_cells(self, msg: Msg) -> None:
        with tracer.start_as_current_span("run_cells") as span:
            span.set_attribute("tyne_file_name", self.tyne_info.file_name)
            await self.tyne_info.run_cells(msg, self)

    @client_message_handler(MessageTypes.SHEET_AUTOFILL)
    async def on_sheet_autofill(self, context: ClientMessageContext) -> None:
        await self.tyne_info.sheet_autofill(context.msg, self.tyne_info.kernel_session)

    @kernel_message_handler(MessageTypes.SHEET_AUTOFILL)
    async def on_kernel_sheet_autofill(self, msg: Msg) -> None:
        await self.tyne_info.sheet_autofill(msg, self.tyne_info.kernel_session)

    @client_message_handler(MessageTypes.RPC_REQUEST)
    def on_rpc_request(self, context: ClientMessageContext) -> None:
        call_server_content = CallServerContent.from_dict(context.msg[CONTENT_TAG])
        self.tyne_info.call_server_method(
            context.msg,
            call_server_content.method,
            call_server_content.args,
            call_server_content.kwargs,
        )

    @client_message_handler(MessageTypes.SAVE_CELL)
    def on_save_cell(self, context: ClientMessageContext) -> None:
        msg = context.msg
        code = msg[CONTENT_TAG][CODE_TAG]
        is_init_cell = msg[META_DATA_TAG].get(IS_INIT_CELL_TAG)
        self.tyne_info.save_cell(
            msg[HEADER_TAG][CELL_ID_TAG], code, is_init_cell=is_init_cell
        )

    @client_message_handler(MessageTypes.CHANGE_CELL_ATTRIBUTE)
    def on_change_cell_attribute(self, context: ClientMessageContext) -> None:
        self.tyne_info.change_cell_attribute(context.msg)
        self.deferred_save()

    @client_message_handler(MessageTypes.CHANGE_SHEET_ATTRIBUTE)
    def on_change_sheet_attribute(self, context: ClientMessageContext) -> None:
        self.tyne_info.change_sheet_attribute(context.msg)
        self.deferred_save()

    @client_message_handler(MessageTypes.INTERRUPT_KERNEL)
    async def on_interrupt_kernel(self, context: ClientMessageContext) -> None:
        await self.tyne_info.interrupt()

    @client_message_handler(MessageTypes.CREATE_SHEET)
    def on_create_sheet(self, context: ClientMessageContext) -> None:
        self.tyne_info.execute_code_in_kernel(
            context.msg,
            "N_.sheets.new_sheet()",
            kernel_session=self.tyne_info.kernel_session,
            reason=MessageTypes.CREATE_SHEET.value,
        )

    @client_message_handler(MessageTypes.DELETE_SHEET)
    def on_delete_sheet(self, context: ClientMessageContext) -> None:
        sheet_id = int(DeleteSheetContent.from_dict(context.msg[CONTENT_TAG]).sheet_id)
        self.tyne_info.execute_code_in_kernel(
            context.msg,
            f"N_.sheets.delete_sheet({sheet_id})",
            kernel_session=self.tyne_info.kernel_session,
            reason=MessageTypes.DELETE_SHEET.value,
        )

    @client_message_handler(MessageTypes.RENAME_SHEET)
    def on_rename_sheet(self, context: ClientMessageContext) -> None:
        rename_sheet_content = RenameSheetContent.from_dict(context.msg[CONTENT_TAG])
        self.tyne_info.execute_code_in_kernel(
            context.msg,
            f"N_.sheets.rename_sheet({rename_sheet_content.sheet_id}, {rename_sheet_content.name!r})",
            kernel_session=self.tyne_info.kernel_session,
            reason=MessageTypes.RENAME_SHEET.value,
        )

    @client_message_handler(MessageTypes.SET_SECRET)
    def on_set_secret(self, context: ClientMessageContext) -> None:
        key = context.msg[CONTENT_TAG]["key"]
        value = context.msg[CONTENT_TAG]["value"]
        if context.user_id is not None:
            self.set_user_secret(context.user_id, context.session, key, value)
        self.send_stdin(context.msg)

    @client_message_handler(MessageTypes.SET_SECRETS)
    def on_set_secrets(self, context: ClientMessageContext) -> None:
        content = SetSecretsContent.from_dict(context.msg[CONTENT_TAG])
        if context.user_id is not None:
            self.set_user_secrets(context.user_id, context.session, content.user)
        self.set_user_secrets(None, context.session, content.tyne)

    @client_message_handler(MessageTypes.COPY_CELLS)
    def on_copy_cells(self, context: ClientMessageContext) -> None:
        self.tyne_info.copy_cells(context.msg)

    @client_message_handler(MessageTypes.INSERT_DELETE_CELLS)
    def on_insert_delete_cells(self, context: ClientMessageContext) -> None:
        self.tyne_info.add_delete_cells(context.msg)

    @client_message_handler(MessageTypes.WIDGET_VALUE_UPDATE)
    def on_widget_value_update(self, context: ClientMessageContext) -> None:
        self.tyne_info.widget_triggered(context.msg)

    @client_message_handler(MessageTypes.WIDGET_GET_STATE)
    def on_widget_get_state(self, context: ClientMessageContext) -> None:
        self.tyne_info.widget_get_state(context.msg)

    @client_message_handler(MessageTypes.WIDGET_VALIDATE_PARAMS)
    def on_widget_validate_params(self, context: ClientMessageContext) -> None:
        self.tyne_info.widget_validate_params(context.msg)

    @client_message_handler(MessageTypes.DRAG_ROW_COLUMN)
    def on_drag_row_column(self, context: ClientMessageContext) -> None:
        self.tyne_info.drag_row_column(context.msg)

    @client_message_handler(MessageTypes.PING)
    def on_ping(self, context: ClientMessageContext) -> None:
        self.tyne_info.execute_code_in_kernel(
            context.msg,
            "pass",
            kernel_session=self.tyne_info.kernel_session,
            reason=MessageTypes.PING.value,
        )

    @client_message_handler(MessageTypes.RELOAD_ENV)
    def on_set_env(self, context: ClientMessageContext) -> None:
        variables = context.session.execute(
            select(Tyne.environment_variables).where(Tyne.id == self.tyne_info.tyne_id)
        ).scalar_one()
        self.tyne_info.reload_env(context.msg, variables)

    def on_client_default(self, msg: Msg) -> None:
        message_header = msg[HEADER_TAG]
        message_type = message_header[MSG_TYPE_TAG]

        if message_type == "complete_request" and (
            cell_id := cell_or_range_for_completion(msg)
        ):
            message_header["completion_info"] = (
                cell_id,
                msg[CONTENT_TAG]["cursor_pos"],
            )
        channel = msg.pop("channel", None)
        if channel is None:
            channel = "shell"
        if channel not in self.tyne_info.channels:
            raise ValueError(f"No such channel: {channel}")
        stream = self.tyne_info.channels[channel]
        self.tyne_info.session_send(stream, msg)

    @kernel_message_handler(MessageTypes.RUN_CELLS)
    async def on_kernel_run_cells(self, msg: Msg) -> None:
        run_cell_content = RunCellsContent.from_dict(msg[CONTENT_TAG])
        if run_cell_content.for_ai:
            await self.on_run_cells(msg)
        return None

    @kernel_message_handler(MessageTypes.START_DOWNLOAD)
    def start_download(self, msg: Msg) -> None:
        NeptyneSessionInfo.from_message_header(msg[PARENT_HEADER_TAG]).write_to_header(
            msg[HEADER_TAG]
        )
        self.reply(
            msg,
            msg[CONTENT_TAG],
            msg[HEADER_TAG][MSG_TYPE_TAG],
            just_to_self=True,
        )
        return None

    @kernel_message_handler("input_request")
    async def on_kernel_input_request(self, msg: Msg) -> Msg | None:
        neptyne_msg_type = msg[PARENT_HEADER_TAG].get("neptyne_msg_type")
        if neptyne_msg_type == MessageTypes.UPLOAD_FILE.value:
            msg[HEADER_TAG][MSG_TYPE_TAG] = MessageTypes.UPLOAD_FILE.value
        elif neptyne_msg_type == MessageTypes.UPLOAD_FILE_TO_GCP.value:
            # Spoof the response to look like an input_reply, and don't send the message to the client.
            msg[HEADER_TAG][MSG_TYPE_TAG] = MessageTypes.UPLOAD_FILE_TO_GCP.value
            msg["channel"] = "stdin"
            msg[HEADER_TAG]["session"] = ""

            msg_content = msg[PARENT_HEADER_TAG].get("neptyne_msg_content")
            content_type = msg_content["content_type"]
            encoded_content = msg_content["content"]
            img_bytes, img_format, *rest = decode_image(content_type, encoded_content)

            url = await upload_image_to_gcs(img_bytes, img_format=img_format)

            msg[CONTENT_TAG] = {
                "status": "ok",
                "value": url,
            }
            self.on_client_default(msg)
            return None

        return msg

    @kernel_message_handler("execute_input")
    def on_kernel_execute_input(self, msg: Msg) -> Msg | None:
        if not msg[PARENT_HEADER_TAG].get(CELL_ID_TAG):
            # These can be quite large when the sheet is large (e.g. N_.load_values()) and there
            # is no need to tell the client when that happens
            return None
        return msg

    @kernel_message_handler("execute_result")
    def on_kernel_execute_result(self, msg: Msg) -> Msg:
        cell_id = msg[PARENT_HEADER_TAG].get(CELL_ID_TAG)
        if cell_id:
            self.tyne_info.notebook.process_cell_execute_result(
                cell_id, msg[CONTENT_TAG]
            )
        return msg

    @kernel_message_handler("execute_reply")
    async def on_kernel_execute_reply(self, msg: Msg) -> Msg:
        parent_header = msg[PARENT_HEADER_TAG]
        cell_id = parent_header.get(CELL_ID_TAG)
        if cell_id:
            self.tyne_info.notebook.process_cell_execute_reply(
                cell_id, msg[CONTENT_TAG], parent_header
            )
        if parent_header.get("neptyne_reason") != "init":
            await self.sync_dash_metadata(
                msg[META_DATA_TAG].get("neptyne", {}),
                parent_header.get("neptyne_user_email"),
            )
        return msg

    @kernel_message_handler("display_data")
    def on_kernel_display_data(self, msg: Msg) -> Msg | None:
        cell_id = msg[PARENT_HEADER_TAG].get(CELL_ID_TAG)
        if not cell_id:
            return msg
        if is_sheet_cell(cell_id):
            return None
        self.tyne_info.notebook.process_display_data(cell_id, msg[CONTENT_TAG])
        return msg

    @kernel_message_handler("stream")
    def on_kernel_stream(self, msg: Msg) -> Msg:
        cell_id = self.tyne_info.notebook.process_stream(
            msg[PARENT_HEADER_TAG].get(CELL_ID_TAG), msg[CONTENT_TAG], msg
        )
        msg[META_DATA_TAG][CELL_ID_TAG] = cell_id
        msg[HEADER_TAG][CELL_ID_TAG] = cell_id
        return msg

    @kernel_message_handler("error")
    def on_kernel_error(self, msg: Msg) -> Msg:
        content = msg[CONTENT_TAG]
        if traceback := content.get("traceback"):
            for line in traceback:
                if service := get_api_error_service(line):
                    self.reply(
                        msg, {"service": service}, MessageTypes.API_QUOTA_EXCEEDED.value
                    )
        cell_id = msg[PARENT_HEADER_TAG].get(CELL_ID_TAG)
        if cell_id is None:
            # Append a new cell so the client displays the error
            cell = self.tyne_info.notebook.get_cell_by_id(
                cell_id, create_if_missing=True
            )
            cell_id = cell.cell_id
            msg[PARENT_HEADER_TAG][CELL_ID_TAG] = cell_id
        self.tyne_info.notebook.process_kernel_error(cell_id, msg)
        return msg

    @kernel_message_handler("complete_reply")
    def on_kernel_complete_reply(self, msg: Msg) -> Msg:
        matches = msg[CONTENT_TAG]["matches"]
        if not matches and (
            completion_info := msg[PARENT_HEADER_TAG].get("completion_info")
        ):
            cell_or_range, cursor_pos = completion_info
            set_cell_api_completion_matches(msg[CONTENT_TAG], cell_or_range, cursor_pos)
        return msg

    @kernel_message_handler(MessageTypes.INSERT_DELETE_CELLS)
    def on_kernel_insert_delete_cells(self, msg: Msg) -> None:
        self.tyne_info.add_delete_cells(msg)

    @kernel_message_handler(MessageTypes.INSERT_DELETE_CELLS_REPLY)
    async def on_kernel_insert_delete_cells_reply(self, msg: Msg) -> Msg:
        # Adjust cellrefs in code editor. Forward the message to client for gridsize updates.
        content = msg[CONTENT_TAG]
        if transformation_dict := content["transformation"]:
            insert_delete_reply = InsertDeleteReplyCellType.from_dict(content)
            transformation = Transformation.from_dict(transformation_dict)
            code = self.tyne_info.notebook.adjust_codepanel_add_delete_cells(
                transformation, insert_delete_reply.sheet_name
            )
            if code:
                run_notebook_msg = copy.deepcopy(msg)
                await self.tyne_info.run_notebook_cell(
                    run_notebook_msg,
                    CODEPANEL_CELL_ID,
                    code,
                    reason="delete/insert",
                    replier=self,
                )
        return msg

    @kernel_message_handler(MessageTypes.SAVE_KERNEL_STATE)
    async def on_kernel_save_kernel_state(self, msg: Msg) -> None:
        if msg[CONTENT_TAG].get("for_client"):
            self.send_tyne_state_to_client(msg)
        else:
            await self.save_kernel_state(msg)

    @kernel_message_handler(MessageTypes.TICK_REPLY)
    def on_kernel_tick_reply(self, msg: Msg) -> None:
        msg_content = TickReplyContent.from_dict(msg[CONTENT_TAG])

        addresses = [a for a in msg_content.addresses]

        if addresses:
            code = f"N_.run_cells_with_cascade_coords({addresses})"
            self.tyne_info.execute_code_in_kernel(
                msg,
                code,
                kernel_session=self.kernel_session,
                org_message_type=msg[HEADER_TAG][MSG_TYPE_TAG],
                reason=MessageTypes.TICK_REPLY.value,
                skip_input_transformers=True,
                tyne_secrets=self.get_tyne_secrets(),
                user_api_token=None,
            )
        for expression in msg_content.expressions:
            run_msg = copy.deepcopy(msg)
            run_msg[HEADER_TAG]["tick_expression"] = expression
            self.tyne_info.execute_code_in_kernel(
                run_msg,
                expression,
                kernel_session=self.kernel_session,
                org_message_type=msg[HEADER_TAG][MSG_TYPE_TAG],
                reason=MessageTypes.TICK_REPLY.value,
                skip_input_transformers=False,
                tyne_secrets=self.get_tyne_secrets(),
                user_api_token=None,
            )

    @kernel_message_handler(MessageTypes.RERUN_CELLS)
    def on_kernel_rerun_cells(self, msg: Msg) -> Msg:
        msg_content = RerunCellsContent.from_dict(msg[CONTENT_TAG])
        if msg_content.addresses:
            code = f"N_.run_cells_with_cascade_coords({msg_content.addresses})"
            self.tyne_info.execute_code_in_kernel(
                copy.deepcopy(msg),
                code,
                kernel_session=self.kernel_session,
                org_message_type=msg[HEADER_TAG][MSG_TYPE_TAG],
                reason=MessageTypes.RERUN_CELLS.value,
                skip_input_transformers=True,
            )
        # Tell the frontend about it so in sheet mode it can rerun the right cells
        return msg

    @kernel_message_handler(MessageTypes.TRACEBACK)
    def on_kernel_traceback(self, msg: Msg) -> Msg | None:
        cell_id = msg[PARENT_HEADER_TAG].get(CELL_ID_TAG)
        if not cell_id:
            return msg
        output = self.tyne_info.notebook.process_traceback(
            cell_id, msg[CONTENT_TAG]["traceback"]
        )
        if not output:
            return None

        msg[CONTENT_TAG] = output.to_dict()
        msg[HEADER_TAG][MSG_TYPE_TAG] = "error"
        return msg

    @kernel_message_handler(MessageTypes.LINTER)
    def on_kernel_linter(self, msg: Msg) -> Msg | None:
        cell_id = msg[PARENT_HEADER_TAG].get(CELL_ID_TAG)
        if not cell_id:
            return msg
        output = self.tyne_info.notebook.process_traceback(
            cell_id, msg[CONTENT_TAG]["linter"], "linter"
        )
        if not output:
            return None

        msg[CONTENT_TAG] = output.to_dict()
        msg[HEADER_TAG][MSG_TYPE_TAG] = "error"
        return msg

    async def sync_dash_metadata(
        self, metadata: dict[str, Any], user_email: str | None
    ) -> None:
        if (
            metadata != self.dash_metadata
            or self.dash_metadata_update_time < time.time() - DASH_METADATA_TTL
        ):
            # if there is no user we can't update the default alert_email so we'll just
            # keep the old value:
            if user_email is None:
                metadata["crons"] = self.dash_metadata.get("crons", [])
            else:
                for cron in metadata.get("crons", []):
                    cron["alert_email"] = cron.get("alert_email", "") or user_email

            assert self.tyne_info.tyne_id
            await self.tyne_storer.set_tyne_property(
                self.tyne_info.tyne_id, "dash_metadata", metadata
            )
            self.dash_metadata = metadata
            self.dash_metadata_update_time = time.time()

from copy import deepcopy
from typing import Any, Awaitable, Callable, Iterable

from jupyter_client.session import Session as KernelSession
from zmq import Message

from neptyne_kernel.cell_address import is_sheet_cell

HEADER_TAG = "header"
MSG_ID_TAG = "msg_id"
CELL_ID_TAG = "cellId"
CELL_TYPE_TAG = "cellType"
IS_INIT_CELL_TAG = "isInitCell"
SHEET_ID_TAG = "sheetId"
ORG_MSG_TYPE_TAG = "orgMsgType"
META_DATA_TAG = "metadata"
MSG_TYPE_TAG = "msg_type"
CONTENT_TAG = "content"
PARENT_HEADER_TAG = "parent_header"
Msg = dict[str, Any]
MsgContent = dict[str, Any]
DEFAULT_CONTENT = {
    "silent": False,
    "store_history": False,
    "user_expressions": {},
    "allow_stdin": True,
    "stop_on_error": True,
}
CODE_TAG = "code"


MessageList = list[bytes] | list[Message]
KernelMessageHandler = Callable[[Any, Msg], Awaitable[None]]


def is_sync_msg(msg_type: str, parent: dict) -> bool:
    """Check if the kernel is sending a message that requests a synchronous response"""
    return "neptyne_msg_type" in parent and msg_type == "input_request"


def default_msg(
    tyne_file_name: str,
    kernel_session: KernelSession,
    msg_type: str,
    cell_id: str | None = None,
    *,
    content: dict[str, Any] | None = None,
) -> Msg:
    if content is None:
        content = {}
    msg = kernel_session.msg(msg_type, content={**DEFAULT_CONTENT, **content})
    msg[HEADER_TAG][SHEET_ID_TAG] = tyne_file_name
    if cell_id:
        msg[HEADER_TAG][CELL_ID_TAG] = cell_id
        msg[META_DATA_TAG][CELL_ID_TAG] = cell_id
    return msg


class CapturingKernelSession(KernelSession):
    """A KernelSession that captures messages"""

    messages: list[tuple[Any, Msg]]

    def __init__(self, kernel_session: KernelSession, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.kernel_session = kernel_session
        self.messages = []

    def send(self, stream: Any, msg: Msg, **kwargs: Any) -> None:  # type: ignore
        self.messages.append((stream, msg))

    def msg(
        self,
        msg_type: str,
        content: dict | None = None,
        parent: dict[str, Any] | None = None,
        header: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return self.kernel_session.msg(msg_type, content, parent, header, metadata)


def split_batch_message(msg: Msg) -> Iterable[Msg]:
    for m in msg[CONTENT_TAG]["messages"]:
        unpacked_msg = deepcopy(msg)
        unpacked_msg[CONTENT_TAG] = m["content"]
        unpacked_msg[HEADER_TAG][MSG_TYPE_TAG] = m["type"]
        yield unpacked_msg


def cell_or_range_for_completion(completion_msg: Msg) -> str | None:
    code = completion_msg[CONTENT_TAG]["code"]
    cursor_pos = completion_msg[CONTENT_TAG]["cursor_pos"]
    if not code or code[cursor_pos - 1] != ".":
        return None
    cell_id_start = cell_id_end = cursor_pos - 2

    def is_id_char(c: str) -> bool:
        return c.isalnum() or c == " " or c == ":"

    while cell_id_start >= 0 and is_id_char(code[cell_id_start]):
        cell_id_start -= 1

    cell_or_range = code[cell_id_start + 1 : cell_id_end + 1].strip()
    if ":" in cell_or_range:
        cell1, cell2 = cell_or_range.split(":", 1)
        cell1 = cell1.strip()
        cell2 = cell2.strip()
        if is_sheet_cell(cell1) and is_sheet_cell(cell2):
            return cell1 + ":" + cell2
    elif is_sheet_cell(cell_or_range):
        return cell_or_range
    return None

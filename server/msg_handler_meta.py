from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from sqlalchemy.orm import Session

from neptyne_kernel.neptyne_protocol import MessageTypes
from server.messages import Msg
from server.models import AccessLevel

MSG_HANDLER_ATTR = "__nt_msg_handler__"


def message_handler(key: Any) -> Callable:
    def decorator(func: Callable) -> Callable:
        setattr(func, MSG_HANDLER_ATTR, key)
        return func

    return decorator


class MessageHandlerMeta(type):
    def __new__(cls, name: str, bases: tuple[type, ...], attrs: dict[str, Any]) -> type:
        msg_handlers = {}

        for name, member in attrs.items():
            if key := getattr(member, MSG_HANDLER_ATTR, None):
                if key in msg_handlers:
                    raise Exception(f"Duplicate handler for message type {key}")
                msg_handlers[key] = name

        handler_class = super().__new__(cls, name, bases, attrs)
        handler_class._handlers = msg_handlers  # type: ignore

        return handler_class


class MessageHandler(metaclass=MessageHandlerMeta):
    _handlers: dict[Any, str]

    def get_handler(self, key: Any) -> Callable | None:
        if handler_name := self._handlers.get(key):
            return getattr(self, handler_name)
        return None


@dataclass
class ClientMessageContext:
    msg: Msg
    session: Session
    user_id: int | None
    access_level: AccessLevel | None


ClientMessageHandlerType = Callable[[Any, ClientMessageContext], Awaitable[None] | None]
KernelMessageHandlerType = Callable[[Any, Msg], Awaitable[Msg | None] | Msg | None]


def client_message_handler(
    msg_type: MessageTypes,
) -> Callable[[ClientMessageHandlerType], Callable]:
    return message_handler(("client", msg_type.value))


def kernel_message_handler(
    msg_type: MessageTypes | str,
) -> Callable[[KernelMessageHandlerType], Callable]:
    if isinstance(msg_type, MessageTypes):
        msg_type = msg_type.value
    return message_handler(("kernel", msg_type))

import random
import typing
from typing import Protocol

from tornado import web

COOKIE_NAME = "streamlit-session"


if typing.TYPE_CHECKING:

    class WebRequestMixinProtocol(Protocol):
        application: web.Application
        set_cookie: typing.Callable
        cookies: dict
else:

    class WebRequestMixinProtocol: ...


class StreamlitSessionMixin(WebRequestMixinProtocol):
    application: web.Application

    @property
    def session_store(self) -> set[str]:
        v = self.application.settings.get("streamlit_session_store")
        assert isinstance(v, set)
        return v

    def reset_streamlit_session(self) -> None:
        self.set_cookie(
            COOKIE_NAME, random.randbytes(16).hex(), samesite="None", secure=True
        )

    def mark_streamlit_session_as_dead(self) -> None:
        if cookie := self.cookies.get(COOKIE_NAME):
            self.session_store.add(cookie.value)

    def mark_streamlit_session_as_alive(self) -> None:
        if cookie := self.cookies.get(COOKIE_NAME):
            self.session_store.discard(cookie.value)

    def assert_session(self) -> None:
        if (
            session := self.cookies.get(COOKIE_NAME)
        ) and session.value in self.session_store:
            raise web.HTTPError(403, "Session expired")

import asyncio
import json
import uuid
from typing import Any, ClassVar

from tornado import web
from tornado.websocket import WebSocketHandler
from tornado_sqlalchemy import SessionMixin

from server.cors import allow_cors
from server.models import APIKey


class NKSRunPyHandler(WebSocketHandler, SessionMixin):
    connections: ClassVar[dict[int, WebSocketHandler]] = {}
    pending_requests: ClassVar[dict[str, asyncio.Future]] = {}

    tyne_id: int

    def set_default_headers(self) -> None:
        allow_cors(self)

    async def open(self, token: str) -> None:  # type:ignore[override]
        with self.make_session() as session:
            api_key = session.query(APIKey).filter_by(key=token).first()
            if not api_key:
                raise web.HTTPError(401, "Invalid token")
            self.tyne_id = api_key.tyne_id
        self.connections[self.tyne_id] = self

    def on_close(self) -> None:
        if self.tyne_id:
            del self.connections[self.tyne_id]

    async def on_message(self, message: str | bytes) -> None:
        if isinstance(message, bytes):
            message = message.decode("utf-8")

        data = json.loads(message)
        response_token = data.get("token")

        if future := self.pending_requests.get(response_token):
            future.set_result(data["result"])

    async def options(self, *args: Any, **kwargs: Any) -> None:
        self.set_status(204)
        await self.finish()

    @classmethod
    async def run_py(cls, code: str, tyne_id: int) -> str | None:
        connection = cls.connections.get(tyne_id)
        if not connection:
            print("Tyne not found!")
            return None

        request_token = str(uuid.uuid4())

        message = json.dumps({"token": request_token, "action": "run", "code": code})

        await connection.write_message(message)

        cls.pending_requests[request_token] = asyncio.Future()

        return json.dumps(await cls.pending_requests[request_token])

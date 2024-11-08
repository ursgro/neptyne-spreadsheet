import base64
import json
import logging
import re
import sys
import traceback
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

from opentelemetry import trace
from tornado import httpclient, web
from tornado.websocket import (
    WebSocketClientConnection,
    WebSocketHandler,
    websocket_connect,
)
from tornado_sqlalchemy import SessionMixin

from neptyne_kernel.json_tools import json_default
from neptyne_kernel.neptyne_protocol import MessageTypes
from neptyne_kernel.session_info import NeptyneSessionInfo
from neptyne_kernel.streamlit_config import STREAMLIT_PORT, stream_url_path
from server.models import AccessLevel, NonUser, User

from ..gsheets_extension import decode_gsheet_extension_token
from ..messages import CONTENT_TAG, HEADER_TAG
from ..msg_handler_meta import ClientMessageContext
from ..neptyne_kernel_service import NeptyneKernelService
from ..proxied_tyne import ProxiedTyne
from ..streamlit_session_mixin import StreamlitSessionMixin
from ..tyne_contents_manager import TyneContentsManager, get_tyne_access_level, shard_id
from ..tyne_info import KernelInitTimeout, KernelSubscriber
from ..users import authenticate_request

tracer = trace.get_tracer(__name__)


def kernel_msg(content: dict, msg_type: str) -> dict:
    return {
        "channel": "shell",
        "content": content,
        "header": {
            "username": "",
            "version": "",
            "session": "",
            "msg_id": "",
            "msg_type": msg_type,
        },
        "metadata": {},
        "parent_header": {},
    }


class ConnectedKernelHandler(SessionMixin, WebSocketHandler):
    tyne_id: str
    tyne_proxy: ProxiedTyne | None
    user_id: int | None
    user_email: str
    user_name: str
    user_profile_image: str
    access_level: AccessLevel | None

    asked_for_auth: bool
    message_queue: list
    allow_other_gsheets: bool

    def initialize(
        self,
        tyne_contents_manager: TyneContentsManager,
        kernel_manager: NeptyneKernelService,
    ) -> None:
        self.log = logging.getLogger(self.__class__.__name__)
        super().initialize()
        self.tyne_contents_manager = tyne_contents_manager
        self.kernel_manager = kernel_manager
        self.session_id = str(uuid4())
        self.tyne_proxy = None
        self.asked_for_auth = False
        self.message_queue = []

        # Two properties to satisfy the WebsocketMixin's origin check
        self.allow_origin = None
        self.allow_origin_pat = ""

    def get_origin(self) -> str | None:
        if "Origin" in self.request.headers:
            origin = self.request.headers.get("Origin")
        else:
            origin = self.request.headers.get("Sec-Websocket-Origin", None)
        return origin

    def check_origin(self, origin: str) -> bool:
        if origin is not None:
            if re.match(r"^https://[a-zA-Z0-9-]+\.googleusercontent\.com", origin):
                # This is to support Google Sheets integration
                return True
            elif re.match(r"^https://[a-zA-Z0-9-]+\.ngrok(-free)?\.(app|dev)$", origin):
                return True
            parsed_origin = urlparse(origin)
            if parsed_origin.hostname and parsed_origin.hostname.lower() == "localhost":
                # This is to support frontend development with api calls
                # proxied to staging. Tornado would otherwise reject any
                # websocket request with a different "Host" header.
                return True
        return super().check_origin(origin)

    async def init_connection(
        self,
        auth_token: str,
        project_id: str | None,
        gsheet_auth_token: str | None,
        subscribe: bool = False,
    ) -> None:
        with self.make_session() as session:
            user: User | NonUser
            self.user_profile_image = ""
            if gsheet_auth_token:
                assert gsheet_auth_token
                user = NonUser.GSHEET
                claims = decode_gsheet_extension_token(gsheet_auth_token)
                self.user_id = None
                self.user_name = f"anon-{claims.sheet_id}"
                self.user_email = f"{self.user_name}@example.com"
            else:
                user = await authenticate_request(self, session, token=auth_token)
                self.user_email = user.email
                self.user_name = user.name
                self.user_id = user.id
                self.allow_other_gsheets = bool(
                    self.user_email
                ) and self.user_email.endswith("@neptyne.com")

            tyne_proxy = await self.tyne_contents_manager.get(
                self.tyne_id, session, user, gsheet_auth_token
            )
            if not self.tyne_contents_manager.is_owner_shard(self.tyne_id):
                raise web.HTTPError(400, "wrong shard index")
            if not tyne_proxy:
                raise web.HTTPError(404, "tyne not found")
            self.tyne_proxy = tyne_proxy
            if not isinstance(user, NonUser):
                self.tyne_proxy.load_user_secrets(user.id, session)
            self.tyne_proxy.load_user_secrets(None, session)
            self.access_level = get_tyne_access_level(
                self.tyne_id, session, user, gsheet_auth_token is not None
            )
        await self.connect_to_kernel(subscribe)

    async def connect_to_kernel(
        self, subscribe: bool = False, nks_name: str | None = None
    ) -> None:
        assert self.tyne_proxy is not None
        load_init_data = self.tyne_contents_manager.init_data_loader(
            self.tyne_id, self.make_session
        )

        try:
            with tracer.start_as_current_span("client_kernel_connect") as span:
                span.set_attribute("tyne_file_name", self.tyne_id)
                if subscribe:
                    subscriber = KernelSubscriber(
                        user_email=self.user_email,
                        user_name=self.user_name,
                        user_profile_image=self.user_profile_image,
                        close=self.close,
                        on_kernel_msg=self.on_kernel_message,
                    )
                else:
                    subscriber = None
                await self.tyne_proxy.connect_to_kernel(
                    self.kernel_manager,
                    load_init_data,
                    timeout=300,
                    session_id=self.session_id,
                    subscriber=subscriber,
                )
        except KernelInitTimeout:
            await self.write_message(
                kernel_msg({"execution_state": "init_failed"}, "status")
            )
            self.close()
            raise web.HTTPError(500, "timed out waiting for kernel to start")

        while self.message_queue:
            msg = self.message_queue.pop(0)
            await self.on_message(msg)  # type: ignore

    def get_compression_options(self) -> dict[str, Any] | None:
        # An empty dictionary enables compression with default options. Returning None (the
        # default) disables compression.
        return {}

    # the type-ignore is necessary because Tornado types *args and **kwargs as 'str'
    async def open(self, tyne_id: str) -> None:  # type:ignore[override]
        self.tyne_id = tyne_id

    def on_kernel_message(self, stream: Any, msg: dict) -> None:
        if self.ws_connection and not self.ws_connection.is_closing():
            now = datetime.now(timezone.utc)
            msg[HEADER_TAG]["server_reply_at"] = now.isoformat()
            channel = getattr(stream, "channel", None)
            if channel:
                msg["channel"] = channel
            self.write_message(
                json.dumps(msg, default=json_default), binary=isinstance(msg, bytes)
            )


class TyneWebsocketHandler(ConnectedKernelHandler):
    async def ask_for_auth(self) -> None:
        # This should be a valid "kernel" message to pass the validation on the frontend
        await self.write_message(kernel_msg({}, MessageTypes.AUTH_REQUIRED.value))

    async def on_message(self, encoded_msg: bytes | str | dict) -> None:
        """Called when a client (browser) sends a message to the server"""
        msg: dict
        if isinstance(encoded_msg, str | bytes):
            msg = json.loads(encoded_msg)
        else:
            msg = encoded_msg

        if msg[HEADER_TAG]["msg_type"] == MessageTypes.AUTH_REPLY.value:
            if self.tyne_proxy is None:
                content_ = msg[CONTENT_TAG]
                await self.init_connection(
                    content_["token"],
                    content_.get("projectId"),
                    content_.get("gsheetAuthToken"),
                    subscribe=True,
                )
            return
        elif msg[HEADER_TAG]["msg_type"] == MessageTypes.RECONNECT_KERNEL.value:
            name = msg[CONTENT_TAG].get("name")
            if self.tyne_proxy is not None:
                await self.write_message(
                    kernel_msg({"execution_state": "restarting"}, "status")
                )
                self.tyne_proxy.tyne_info.handle_shutdown()
                await self.kernel_manager.shutdown_kernel(self.tyne_id)
                await self.connect_to_kernel(subscribe=True, nks_name=name)
            return

        if not self.tyne_proxy:
            self.message_queue.append(msg)
            if not self.asked_for_auth:
                self.asked_for_auth = True
                await self.ask_for_auth()
            return

        assert self.tyne_proxy

        msg[HEADER_TAG]["server_receive_at"] = datetime.now(timezone.utc)

        session_info = NeptyneSessionInfo(
            session_id=self.session_id,
            user_email=self.user_email,
            user_name=self.user_name,
            user_secrets=self.tyne_proxy.get_user_secrets(self.user_id)
            if self.user_id
            else {},
            tyne_secrets=self.tyne_proxy.get_tyne_secrets(),
            user_profile_image=self.user_profile_image,
            user_api_token="",
            sheets_api_token="",
        )
        session_info.write_to_header(msg[HEADER_TAG])

        try:
            with self.make_session() as session:
                await self.tyne_proxy.handle_client_message(
                    ClientMessageContext(msg, session, self.user_id, self.access_level)
                )
        except Exception as e:
            # We shouldn't handle user errors here -- this is a catch-all to prevent killing
            # the connection when something unexpected goes wrong. If possible, handle
            # errors in the tyne message handlers
            self.log.exception(e)
            await self.write_message(
                kernel_msg(
                    {
                        "ename": e.__class__.__name__,
                        "evalue": str(e),
                        "traceback": traceback.format_exception(*sys.exc_info()),
                    },
                    "error",
                )
            )

    def on_close(self) -> None:
        try:
            if self.tyne_proxy:
                self.tyne_proxy.update_kernel_subscriber(self.session_id, None)
        except ValueError:
            pass


class StreamlitWebsocketHandler(StreamlitSessionMixin, ConnectedKernelHandler):
    _client: WebSocketClientConnection
    _subprotocols: list

    def initialize(
        self,
        tyne_contents_manager: TyneContentsManager,
        kernel_manager: NeptyneKernelService,
    ) -> None:
        super().initialize(tyne_contents_manager, kernel_manager)
        self._subprotocols = []

    # the type-ignore is necessary because Tornado types *args and **kwargs as 'str'
    async def open(self, tyne_id: str) -> None:  # type:ignore[override]
        await super().open(tyne_id)
        try:
            await self.connect_streamlit(tyne_id)
            self.mark_streamlit_session_as_alive()
        except Exception:
            self.mark_streamlit_session_as_dead()
            raise

    async def connect_streamlit(self, tyne_id: str) -> None:
        shard_index = shard_id(tyne_id, self.tyne_contents_manager.num_shards)

        path = stream_url_path(shard_index, tyne_id)
        if len(self._subprotocols) < 2:
            raise web.HTTPError(400, "No auth")

        combined_token = self._subprotocols[1]
        combined_token = base64.urlsafe_b64decode(combined_token + "==").decode()
        firebase_token, gheet_auth_token, project_id = combined_token.split(":")

        await self.init_connection(
            firebase_token,
            project_id,
            gheet_auth_token,
        )

        kernel = self.kernel_manager.get_kernel(self.tyne_id)
        # TODO: make this work with NKS
        if hasattr(kernel, "provisioner") and kernel.provisioner:
            kernel_host = str(kernel.provisioner.connection_info.get("ip", "localhost"))
        else:
            kernel_host = "localhost"

        url = f"ws://{kernel_host}:{STREAMLIT_PORT}{path}"
        request = httpclient.HTTPRequest(
            url,
            headers={
                "X-Streamlit-User": base64.b64encode(
                    json.dumps(
                        {
                            "email": self.user_email,
                            "isPublicCloudApp": False,
                        }
                    ).encode()
                ).decode(),
            },
        )

        self._client = await websocket_connect(
            request,
            on_message_callback=self.on_streamlit_message,
            subprotocols=self._subprotocols,
        )

    def select_subprotocol(self, subprotocols: list[str]) -> str | None:
        if subprotocols:
            self._subprotocols[:] = subprotocols[:]
            return subprotocols[0]
        return None

    def on_streamlit_message(self, message: None | str | bytes) -> None:
        if message is None:
            return
        if self.ws_connection and not self.ws_connection.is_closing():
            self.write_message(message, binary=True)

    async def on_message(self, message: str | bytes) -> None:
        await self._client.write_message(message, binary=True)

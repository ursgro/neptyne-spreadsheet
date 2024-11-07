import datetime
import os
import re
from pathlib import Path
from typing import Generator, Optional
from urllib.parse import urlparse, urlunparse

from sqlalchemy import select
from streamlit import file_util as streamlit_file_util
from streamlit.web.server.routes import StaticFileHandler
from tornado import web
from tornado.httpclient import AsyncHTTPClient, HTTPRequest, HTTPResponse
from tornado.simple_httpclient import HTTPTimeoutError
from tornado_sqlalchemy import SessionMixin

from neptyne_kernel.code_highlight import highlight_code
from neptyne_kernel.streamlit_config import STREAMLIT_PORT
from server.gsheets_extension import (
    can_access_gsheet_tyne,
    decode_gsheet_extension_token,
    get_or_create_tyne_for_sheet,
)
from server.models import NonUser, Tyne
from server.neptyne_kernel_service import NeptyneKernelService
from server.streamlit_session_mixin import StreamlitSessionMixin
from server.tyne_contents_manager import TyneContentsManager, shard_id


class StreamlitHostConfigHandler(StreamlitSessionMixin, web.RequestHandler):
    async def get(self, *_path_args: str) -> None:
        self.assert_session()
        allowed = [
            "https://app.neptyne.com",
            "https://staging.neptyne.dev",
            "https://demo.neptyne.dev",
            "https://demo2.neptyne.dev",
            "https://*.googleusercontent.com",
        ]

        if os.getpid() != 1:
            allowed.extend(
                [
                    "http://localhost",
                    "http://localhost:8877",
                    "https://*.ngrok-free.app",
                    "https://*.ngrok.dev",
                ]
            )

        await self.finish(
            {
                "allowedOrigins": allowed,
                "useExternalAuthToken": True,
                "enableCustomParentMessages": True,
            }
        )


class StreamlitHostMainHandler(SessionMixin, web.RequestHandler):
    def initialize(self, tyne_contents_manager: TyneContentsManager) -> None:
        self.tyne_contents_manager = tyne_contents_manager

    async def no_access(self) -> None:
        self.set_status(404)
        await self.render("streamlit-not-found.html", highlight_code=highlight_code)

    async def get(self, tyne_id: str) -> None:
        tyne_or_gsheet_id = tyne_id.removesuffix("/")

        gsheet_auth_token = self.request.headers.get("X-Neptyne-Token", "")

        if len(tyne_or_gsheet_id) == 10:
            tyne_id = tyne_or_gsheet_id
            tyne_model = self.session.execute(
                select(Tyne).where(Tyne.file_name == tyne_id)
            ).scalar_one_or_none()
        else:
            decoded_token = decode_gsheet_extension_token(gsheet_auth_token)
            _, tyne_model = await get_or_create_tyne_for_sheet(
                self.tyne_contents_manager,
                tyne_or_gsheet_id,
                decoded_token.tyne_file_name,
                self.session,
                decoded_token.owner_email,
                NonUser.GSHEET,
                return_content=False,
            )
            tyne_id = tyne_model.file_name

        if tyne_model is None:
            return await self.no_access()

        dash_metadata = (
            tyne_model.properties.get("dash_metadata", {})
            if tyne_model.properties
            else {}
        )
        streamlit_meta_data = dash_metadata.get("streamlit", {})
        is_public = streamlit_meta_data.get("public")

        if not (is_public or can_access_gsheet_tyne(tyne_model, gsheet_auth_token)):
            return await self.no_access()

        if not streamlit_meta_data:
            return await self.render(
                "streamlit-get-started.html", highlight_code=highlight_code
            )

        shard_index = shard_id(tyne_id, self.tyne_contents_manager.num_shards)

        host = self.request.headers.get("X-Forwarded-Host", self.request.host)
        scheme = "http" if host.startswith("localhost") else "https"
        iframe_src = f"{scheme}://{host}/ws/{shard_index}/api/sl-app/{tyne_id}/"
        await self.render(
            "streamlit.html",
            title=streamlit_meta_data.get("title", "Neptyne"),
            iframe_src=iframe_src,
            tyne_file_name=tyne_id,
        )


class StreamlitGuestMainHandler(StreamlitSessionMixin, web.RequestHandler):
    async def get(self, *_path_args: str) -> None:
        self.reset_streamlit_session()
        index_file = os.path.join(streamlit_file_util.get_static_dir(), "index.html")
        await self.render(index_file)


class StreamlitProxyHandler(web.RequestHandler):
    kernel_manager: NeptyneKernelService

    def initialize(
        self,
        kernel_manager: NeptyneKernelService,
    ) -> None:
        self.kernel_manager = kernel_manager

    async def handle_request(self, tyne_id: str, path: str) -> None:
        headers = {
            **self.request.headers,
            # "Host": self.host,
        }

        tokens = self.request.headers.get("X-Neptyne-Auth-Token")
        if not tokens:
            raise web.HTTPError(401, "Missing X-Neptyne-Auth-Token header")

        _firebase_token, gsheet_token, _project_id = tokens.split(":")
        if not gsheet_token:
            raise web.HTTPError(401, "Missing gsheet token")

        decoded_claims = decode_gsheet_extension_token(gsheet_token)
        if decoded_claims.tyne_file_name != tyne_id:
            raise web.HTTPError(401, "Invalid gsheet token")

        url = self.request.uri or "/"

        _scheme, _netloc, path, *rest = urlparse(url)

        try:
            kernel = self.kernel_manager.get_kernel(tyne_id)
        except KeyError:
            self.set_status(404)
            await self.finish("Streamlit app not running")
            return

        if hasattr(kernel, "provisioner") and kernel.provisioner:
            kernel_host = str(kernel.provisioner.connection_info.get("ip", "localhost"))
        else:
            kernel_host = "localhost"

        url = urlunparse(("http", f"{kernel_host}:{STREAMLIT_PORT}", path, *rest))

        request = HTTPRequest(
            url=url,
            method=self.request.method or "GET",
            headers=headers,
            body=self.request.body,
            allow_nonstandard_methods=True,
            follow_redirects=True,
        )
        try:
            res = await self.fetch(request)
        except HTTPTimeoutError:
            self.set_status(504)
            await self.finish("Timeout error")
            return

        self.set_status(res.code)
        if res.body:
            body = res.body
            await self.finish(body)

    async def fetch(self, request: HTTPRequest) -> HTTPResponse:
        client = AsyncHTTPClient()
        return await client.fetch(request, raise_error=False)

    head = handle_request
    get = handle_request
    post = handle_request
    put = handle_request
    options = handle_request


class StreamlitHealthHandler(StreamlitSessionMixin, web.RequestHandler):
    async def get(self, tyne_id: str) -> None:
        self.assert_session()
        self.set_status(200)
        await self.finish("OK")


class StyleInjectingStaticHandler(StaticFileHandler):
    main_css_re = re.compile(r"main\.[a-z0-9]+\.css")
    css_file_path = Path(__file__).parent / "templates" / "streamlit.css"
    css_file_length = os.path.getsize(css_file_path)

    def _stat_overrides(self) -> os.stat_result:
        if not hasattr(self, "_stat_overrides_result"):
            self._stat_overrides_result = os.stat(self.css_file_path)
        return self._stat_overrides_result

    @classmethod
    def is_main_css(cls, abspath: str) -> bool:
        return bool(cls.main_css_re.match(os.path.basename(abspath)))

    @classmethod
    def get_content(
        cls, abspath: str, start: Optional[int] = None, end: Optional[int] = None
    ) -> Generator[bytes, None, None]:
        yield from super().get_content(abspath, start, end)
        if cls.is_main_css(abspath):
            yield from super().get_content(str(cls.css_file_path.absolute()))

    def get_content_size(self) -> int:
        extra = 0
        if self.absolute_path is not None and self.is_main_css(self.absolute_path):
            extra = self._stat_overrides().st_size
        return super().get_content_size() + extra

    def get_modified_time(self) -> Optional[datetime.datetime]:
        return datetime.datetime.utcfromtimestamp(int(self._stat_overrides().st_mtime))

import aiohttp
from tornado import web


class HTTPClientSessionMixin:
    application: web.Application

    async def get_http_client(self) -> aiohttp.ClientSession:
        if not self.application.settings.get("aiohttp_client_session"):
            self.application.settings["aiohttp_client_session"] = aiohttp.ClientSession(
                raise_for_status=True
            )
        return self.application.settings["aiohttp_client_session"]

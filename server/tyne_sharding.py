from functools import wraps
from typing import Any, Callable
from urllib.parse import urlparse, urlunparse

import aiohttp
from tornado.web import RequestHandler

from neptyne_kernel.mime_types import JSON_MIME_KEY
from server.tyne_contents_manager import TyneContentsManager, shard_id
from server.tyne_handler import TyneHandler


def destination_for_tyne_id(
    uri: str,
    tyne_contents_manager: TyneContentsManager,
    tyne_file_name: str,
) -> str:
    _scheme, _netloc, *rest = urlparse(uri)
    shard = shard_id(tyne_file_name, tyne_contents_manager.num_shards)
    new_host = f"neptyne-server-{shard}"
    return urlunparse(("http", new_host, *rest))


async def maybe_forward_request_to_owner(
    handler: RequestHandler,
    tyne_contents_manager: TyneContentsManager,
    tyne_file_name: str,
) -> bool:
    if tyne_contents_manager.is_owner_shard(tyne_file_name):
        return False
    async with aiohttp.ClientSession() as http_session:
        assert handler.request.uri is not None
        destination = destination_for_tyne_id(
            handler.request.uri, tyne_contents_manager, tyne_file_name
        )
        res = await http_session.request(
            handler.request.method or "POST",
            destination,
            data=handler.request.body,
            headers=handler.request.headers,
        )
        handler.set_status(res.status)
        content = (await res.read()).decode("utf-8")
        handler.set_header(
            "Content-Type",
            res.headers.get("Content-Type", JSON_MIME_KEY),
        )
        await handler.finish(content)
        return True


def forward_to_owner(request_handler_method: Callable) -> Callable:
    @wraps(request_handler_method)
    async def process_request(self: TyneHandler, *args: Any, **kwargs: Any) -> None:
        tyne_file_name = self.resolve_tyne_file_name(kwargs["tyne_file_name"])
        if await maybe_forward_request_to_owner(
            self, self.tyne_contents_manager, tyne_file_name
        ):
            return
        await request_handler_method(self, *args, **kwargs)

    return process_request

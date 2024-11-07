import gzip
import urllib.parse
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Mapping

import aiohttp
from google.auth import default as default_credentials
from google.auth.transport.requests import Request as GoogleRequest


class BlobStore(ABC):
    @abstractmethod
    async def get(self, path: str) -> bytes:
        pass

    @abstractmethod
    async def put(self, path: str, data: bytes, content_type: str) -> None:
        pass

    @abstractmethod
    async def exists(self, path: str) -> bool:
        pass


class LocalFileStore(BlobStore):
    def __init__(self, root: str | None = None) -> None:
        self.root = Path(root or ".neptyne-content")
        if not self.root.exists():
            self.root.mkdir(parents=True)

    async def get(self, path: str) -> bytes:
        return (self.root / path).read_bytes()

    async def put(self, path: str, data: bytes, content_type: str) -> None:
        dest = self.root / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)

    async def exists(self, path: str) -> bool:
        return (self.root / path).exists()


class GCSStore(BlobStore):
    session: aiohttp.ClientSession | None
    bucket: str

    def __init__(self, bucket: str, prefix: str = "") -> None:
        assert not prefix.endswith("/")
        self.prefix = prefix
        self.bucket = bucket
        credentials, _project = default_credentials()
        self.credentials = credentials

    def path(self, path: str, quote: bool = False) -> str:
        res = f"{self.prefix}/{path}" if self.prefix else path
        if quote:
            res = urllib.parse.quote(res, safe="")
        return res

    async def request(
        self,
        method: str,
        uri: str,
        params: Mapping[str, str] | None = None,
        data: Any = None,
        headers: Mapping[str, str] | None = None,
    ) -> aiohttp.ClientResponse:
        assert self.session is not None
        headers = {**(headers or {}), **self._auth_header()}

        res = await self.session.request(
            method, uri, headers=headers, params=params, data=data
        )
        if res.status in (401, 404):
            self.credentials.refresh(GoogleRequest())
            headers = {**headers, **self._auth_header()}
            res = await self.session.request(
                method, uri, headers=headers, params=params, data=data
            )
        return res

    async def initialize_session(self) -> None:
        self.session = aiohttp.ClientSession()

    async def get(self, path: str) -> bytes:
        path = self.path(path, quote=True)
        res = await self.request(
            "GET",
            f"https://storage.googleapis.com/storage/v1/b/{self.bucket}/o/{path}",
            params={"alt": "media"},
        )
        if res.status == 404:
            raise FileNotFoundError(f"File {path} not found")
        if res.status != 200:
            raise ValueError(f"Failed to get {path}: {res.status}")
        return await res.read()

    async def put(self, path: str, data: bytes, content_type: str) -> None:
        data = gzip.compress(data)
        res = await self.request(
            "POST",
            f"https://storage.googleapis.com/upload/storage/v1/b/{self.bucket}/o",
            params={
                "uploadType": "media",
                "name": self.path(path),
                "contentEncoding": "gzip",
            },
            data=data,
            headers={"Content-Type": content_type},
        )
        if res.status != 200:
            raise ValueError(f"Failed to put {path}: {res.status}")

    async def exists(self, path: str) -> bool:
        path = self.path(path, quote=True)
        res = await self.request(
            "GET",
            f"https://storage.googleapis.com/storage/v1/b/{self.bucket}/o/{path}",
        )
        return res.status == 200

    def _auth_header(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.credentials.token}"}

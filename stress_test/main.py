import argparse
import asyncio
import json
import os.path
import random
import sys
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

import firebase_admin
import requests
import tornado.websocket
from firebase_admin import auth
from tornado.httpclient import AsyncHTTPClient

from neptyne_kernel.cell_address import Address
from neptyne_kernel.neptyne_protocol import MessageTypes
from server.integration_test import run_cell_msg

FIREBASE_API_KEY = "AIzaSyDDaSC9zkgf6AQpq2slcL-rqFGFkOS9A00"

CellAddress = Address | str

MAX_RECONNECTS = 5


@dataclass
class Event:
    tyne_id: str
    time: float
    data: dict
    cell: CellAddress | None = None
    duration: float | None = None
    source: str | None = None


class EventLogger:
    events: list[Event]

    def __init__(self, verbose):
        self.events = []
        self.verbose = verbose

    @asynccontextmanager
    async def timed(self, tyne_id: str, cell: CellAddress | None, data):
        if self.verbose:
            print(f"{tyne_id=} {cell=} {data=}", file=sys.stderr)
        start = time.time()
        try:
            yield
        finally:
            self.events.append(Event(tyne_id, start, data, cell, time.time() - start))

    def log(self, tyne_id: str, cell: CellAddress | None, data, source=None):
        self.events.append(Event(tyne_id, time.time(), data, cell, source=source))

    def dump(self, fp=sys.stdout):
        def data_default(event, path, default=None):
            val = event.data
            if not val:
                return default
            try:
                for key in path.split("/"):
                    val = val[key]
                return val
            except (KeyError, AttributeError, TypeError):
                return default

        for event in self.events:
            record = {
                "tyne_id": event.tyne_id,
                "time": event.time,
                "data": event.data,
                "cell": str(event.cell),
                "source": event.source,
                "duration": event.duration,
                "msg_type": data_default(event, "header/msg_type"),
                "msg_id": data_default(event, "header/msg_id"),
                "parent_type": data_default(event, "parent_header/msg_type"),
                "parent_id": data_default(event, "parent_header/msg_id"),
                "state": data_default(event, "content/execution_state"),
            }
            json.dump(record, fp)
            fp.write("\n")


class TyneClient:
    logger: EventLogger
    reconnects: int

    def __init__(self, host, port, auth_token, logger, *, callback=None):
        self.host: str = host
        self.port = port
        self.ws_connection = None
        self.auth_token = auth_token
        self.logger = logger
        self.reconnects = 0
        self.callback = callback

    def on_message(self, msg: Any):
        if self.callback:
            self.callback(msg)

    async def connect_ws(self, tyne_file_name, shard_id):
        host = self.host.replace("http", "ws", 1)
        ws_url = (
            host
            + ":"
            + str(self.port)
            + f"/ws/{shard_id}"
            + "/api/kernels/"
            + str(tyne_file_name)
            + "/channels"
        )

        async with self.logger.timed(tyne_file_name, None, "connect to websocket"):
            connection = await tornado.websocket.websocket_connect(ws_url)

        retries = 0
        while retries < MAX_RECONNECTS:
            result = await self.init_connection(tyne_file_name, connection)
            if result is not None:
                break
            print(f"retrying {tyne_file_name=}...", file=sys.stderr)
            connection = await tornado.websocket.websocket_connect(ws_url)
            retries += 1
        else:
            raise ValueError("failed to connect to websocket")

    async def init_connection(self, tyne_file_name, connection):
        await connection.write_message(
            json.dumps(
                {
                    "header": {
                        "date": "",
                        "msg_id": str(uuid4()),
                        "username": "username",
                        "session": "",
                        "msg_type": MessageTypes.AUTH_REPLY.value,
                        "version": "5.2",
                    },
                    "metadata": {},
                    "content": {"token": self.auth_token, "inGSMode": False},
                    "buffers": [],
                    "parent_header": {},
                    "channel": "shell",
                }
            )
        )
        await connection.write_message(
            json.dumps(
                {
                    "header": {
                        "date": "",
                        "msg_id": str(uuid4()),
                        "msg_type": "kernel_info_request",
                        "session": "",
                        "username": "username",
                        "version": "5.2",
                    },
                    "metadata": {},
                    "content": {},
                    "buffers": [],
                    "parent_header": {},
                    "channel": "shell",
                }
            )
        )
        while True:
            response = await connection.read_message()
            if response is None:
                return None
            parsed = json.loads(response)
            if parsed["header"]["msg_type"] == "kernel_info_reply":
                self.logger.log(tyne_file_name, None, parsed)
                self.on_message(parsed)
                break

        self.ws_connection = connection

        return True

    async def run_cell(self, code, cell_id, tyne_id, msg_id=None):
        assert self.ws_connection

        msg = run_cell_msg(code, cell_id, tyne_id, msg_id)
        self.logger.log(tyne_id, cell_id, msg, source=code)
        self.ws_connection.write_message(json.dumps(msg))

        while True:
            response = await self.ws_connection.read_message()
            if response is None:
                if self.reconnects < MAX_RECONNECTS:
                    self.logger.log(
                        tyne_id, None, "websocket closed running cell: reconnecting"
                    )
                    self.reconnects += 1
                    await self.connect_ws(tyne_id)
                else:
                    self.logger.log(
                        tyne_id,
                        None,
                        "websocket closed running cell: max reconnects reached",
                    )
                    raise ValueError(
                        "websocket closed running cell: max reconnects reached"
                    )
            parsed = json.loads(response)
            self.on_message(parsed)
            self.logger.log(tyne_id, cell_id, parsed)
            if (
                parsed["header"]["msg_type"] == "status"
                and parsed["content"]["execution_state"] == "idle"
            ):
                break

    async def new_tyne(self):
        http_client = AsyncHTTPClient()
        response = await http_client.fetch(
            f"{self.host}:{self.port}/api/tyne_new",
            method="POST",
            body="{}",
            headers={"Authorization": f"Bearer {self.auth_token}"},
        )
        return json.loads(response.body.decode("utf8"))

    async def delete_tyne(self, tyne_id):
        http_client = AsyncHTTPClient()
        await http_client.fetch(
            f"{self.host}:{self.port}/ws/0/api/tyne_delete/{tyne_id}",
            method="POST",
            body="{}",
            headers={"Authorization": f"Bearer {self.auth_token}"},
        )


def sign_in(uid) -> str:
    custom_token = auth.create_custom_token(uid).decode()
    return requests.post(
        "https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyCustomToken",
        json={"token": custom_token, "returnSecureToken": True},
        params={"key": FIREBASE_API_KEY},
    ).json()["idToken"]


async def run_tyne_interaction(client: TyneClient):
    tyne_id = (await client.new_tyne())["remoteTyne"]["file_name"]

    await client.connect_ws(tyne_id)

    for _ in range(5):
        for src, cell in (
            ("=2", Address.from_a1("A1", 0)),
            ("=A1**2", Address.from_a1("B1", 0)),
            ("def do_something():\n    return 0", "00"),
            ("=do_something()", Address.from_a1("A2", 0)),
        ):
            await asyncio.sleep(random.random() * 3)
            await client.run_cell(src, cell, tyne_id)

    await client.delete_tyne(tyne_id)

    return tyne_id


async def main(host, port, num_tynes, verbose):
    firebase_admin.initialize_app(
        credential=firebase_admin.credentials.Certificate(
            os.path.dirname(__file__) + "/service_account.json"
        )
    )
    uid = "vBY7MnU9yfhUZiIjakiUjYtarSn2"  # test-user-0@neptyne.com
    id_token = sign_in(uid)

    event_logger = EventLogger(verbose)

    futures = []
    clients = []
    for i in range(num_tynes):
        client = TyneClient(host, port, id_token, event_logger)
        clients.append(client)
        futures.append(asyncio.create_task(run_tyne_interaction(client)))

    await asyncio.gather(*futures, return_exceptions=True)
    for future, client in zip(futures, clients):
        if future.exception():
            print(future.exception(), file=sys.stderr)
        if client.ws_connection:
            client.ws_connection.close()
    event_logger.dump()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="http://localhost")
    parser.add_argument("--port", default=8877, type=int)
    parser.add_argument("--num-tynes", default=1, type=int)
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()
    if args.verbose:
        VERBOSE = True

    start = time.time()
    asyncio.run(main(args.host, args.port, args.num_tynes, args.verbose))
    print(f"Time: {time.time() - start}", file=sys.stderr)

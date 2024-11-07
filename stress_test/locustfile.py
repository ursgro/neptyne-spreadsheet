import os
import time
from typing import Any
from uuid import uuid4

import firebase_admin
from jupyter_client.utils import run_sync
from locust import User, between, task

from neptyne_kernel.cell_address import Address
from stress_test.main import EventLogger, TyneClient, sign_in

firebase_admin.initialize_app(
    credential=firebase_admin.credentials.Certificate(
        os.path.dirname(__file__) + "/service_account.json"
    )
)


class TyneUser(User):
    abstract = True

    # host: str = "https://staging.neptyne.dev"

    def run_cell(self, src, cell):
        msg_id = str(uuid4())
        self.times[msg_id] = time.time()
        return run_sync(self.client.run_cell)(src, cell, self.tyne_id, msg_id)

    def on_start(self):
        self.times = {}
        if "localhost" in self.host:
            port = 887
        elif self.host.startswith("https"):
            port = 443
        else:
            port = 80
        uid = "vBY7MnU9yfhUZiIjakiUjYtarSn2"  # test-user-0@neptyne.com
        self.id_token = sign_in(uid)
        event_logger = EventLogger(False)
        self.client = TyneClient(
            self.host, port, self.id_token, event_logger, callback=self.on_message
        )
        tyne = run_sync(self.client.new_tyne)()["remoteTyne"]
        self.tyne_id = tyne["file_name"]
        shard_id = tyne["shard_id"]
        run_sync(self.client.connect_ws)(self.tyne_id, shard_id)

    def on_message(self, msg: Any):
        duration = None
        if parent_id := msg.get("parent_header", {}).get("msg_id"):
            if start := self.times.get(parent_id):
                duration = 1000 * (time.time() - start)
        self.environment.events.request.fire(
            request_type="WSR",
            name=msg["header"]["msg_type"],
            response_time=duration,
            response_length=len(msg),
            exception=None,
            context=self.context(),
        )

    def on_stop(self):
        if self.client.ws_connection:
            self.client.ws_connection.close()
        run_sync(self.client.delete_tyne)(self.tyne_id)


class BasicUser(TyneUser):
    wait_time = between(1, 5)

    @task
    def set_A1(self):
        self.run_cell("=2", Address.from_a1("A1", 0))
        self.run_cell("=A1**2", Address.from_a1("B1", 0))

    @task
    def do_repl(self):
        (self.run_cell("def do_something():\n    return 0", "00"),)
        (self.run_cell("=do_something()", Address.from_a1("A2", 0)),)

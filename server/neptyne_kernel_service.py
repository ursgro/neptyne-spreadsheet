import asyncio
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Awaitable

import zmq
from jupyter_client import AsyncKernelClient, KernelClient
from jupyter_client.ioloop import AsyncIOLoopKernelManager
from jupyter_client.kernelspec import KernelSpecManager
from jupyter_client.session import Session, utcnow
from kubernetes_asyncio import client
from kubernetes_asyncio.client import ApiException
from tornado.ioloop import IOLoop
from zmq.asyncio import Context
from zmq.eventloop.zmqstream import ZMQStream

from neptyne_kernel.session_info import NeptyneSessionInfo
from server.kernels.k8s import KernelPodPool

IDLE_TIMEOUT_NO_USER_ACTIVITY = timedelta(seconds=180)
IDLE_TIMEOUT_WITH_USER_ACTIVITY = timedelta(seconds=3600)


@dataclass
class KernelActivityTracker:
    last_activity: datetime
    last_user_activity: datetime | None
    activity_stream: ZMQStream


def as_zmqstream(f):
    """Convert a socket to a zmq stream."""

    def wrapped(self, *args, **kwargs):
        save_socket_class = None
        # zmqstreams only support sync sockets
        if self.client.context._socket_class is not zmq.Socket:
            save_socket_class = self.client.context._socket_class
            self.client.context._socket_class = zmq.Socket
        try:
            socket = f(self.client, *args, **kwargs)
        finally:
            if save_socket_class:
                # restore default socket class
                self.client.context._socket_class = save_socket_class
        return ZMQStream(socket, self.loop)

    return wrapped


class NeptyneLocalKernelClientParent:
    @property
    def loop(self):
        return IOLoop.current()

    def __init__(self, client):
        self.client = client

    connect_shell = as_zmqstream(AsyncKernelClient.connect_shell)
    connect_control = as_zmqstream(AsyncKernelClient.connect_control)
    connect_iopub = as_zmqstream(AsyncKernelClient.connect_iopub)
    connect_stdin = as_zmqstream(AsyncKernelClient.connect_stdin)
    connect_hb = as_zmqstream(AsyncKernelClient.connect_hb)


class NeptyneLocalKernelClient(AsyncKernelClient):
    def connector(self):
        return NeptyneLocalKernelClientParent(self)


class NeptyneKernelService:
    namespace: str
    pod_pool: KernelPodPool | None
    api_client: client.ApiClient | None
    kernels: dict[str, AsyncIOLoopKernelManager]
    starting_kernels: dict[str, Awaitable[None]]
    kernel_spec_manager: KernelSpecManager
    connection_dir: str
    activity_trackers: dict[str, KernelActivityTracker]
    culler_task: asyncio.Task | None

    def __init__(
        self,
        namespace: str,
        pod_pool: KernelPodPool | None,
        k8s_client: client.ApiClient,
        kernel_spec_manager: KernelSpecManager,
        connection_dir: str,
    ) -> None:
        self.namespace = namespace
        self.kernel_spec_manager = kernel_spec_manager
        self.connection_dir = connection_dir

        self.kernels = {}
        self.starting_kernels = {}
        self.activity_trackers = {}
        self.culler_task = None

        # Here so that they are accessible to kernel provisioners
        self.pod_pool = pod_pool
        self.api_client = k8s_client

    def start_culler(self) -> None:
        if self.culler_task is not None:
            return
        self.culler_task = asyncio.create_task(self.culler())

    async def culler(self) -> None:
        while True:
            try:
                await asyncio.sleep(30)
                await self.cull_idle_kernels()
            except Exception as e:
                print("Error in culler: ", e, file=sys.stderr)

    async def cull_idle_kernels(self) -> None:
        now = utcnow()
        to_cull = []
        for kernel_id, tracker in self.activity_trackers.items():
            kernel = self.kernels[kernel_id]
            if kernel.provisioner and hasattr(kernel.provisioner, "sync_activity"):
                try:
                    await kernel.provisioner.sync_activity(
                        tracker.last_activity, tracker.last_user_activity
                    )
                except ApiException as e:
                    print(
                        "Error syncing activity for kernel",
                        kernel_id,
                        e,
                        file=sys.stderr,
                    )
            if (
                tracker.last_user_activity is not None
                and now < tracker.last_user_activity + IDLE_TIMEOUT_WITH_USER_ACTIVITY
            ):
                continue
            if now < tracker.last_activity + IDLE_TIMEOUT_NO_USER_ACTIVITY:
                continue
            to_cull.append(kernel_id)

        for kernel_id in to_cull:
            print("Culling idle kernel", kernel_id, file=sys.stderr)
            try:
                await self.shutdown_kernel(kernel_id)
            except Exception as e:
                print("Error shutting down kernel", kernel_id, e, file=sys.stderr)

    async def connect_to_local_kernel(
        self, kernel_id: str, connection_file: str
    ) -> KernelClient:
        client = NeptyneLocalKernelClient()
        client.load_connection_file(connection_file)
        return client

    async def start_kernel(
        self,
        kernel_id: str,
        kernel_name: str,
        force_new_pod: bool,
    ) -> None:
        if kernel_id in self.kernels:
            return
        elif kernel_id in self.starting_kernels:
            return await self.starting_kernels[kernel_id]

        kernel_manager = AsyncIOLoopKernelManager(
            context=Context.instance(),
            connection_file=os.path.join(self.connection_dir, f"{kernel_id}.json"),
            kernel_name=kernel_name,
            kernel_spec_manager=self.kernel_spec_manager,
        )

        kernel_manager.autorestart = False
        # noinspection PyTypeChecker
        awaitable = self.starting_kernels[kernel_id] = asyncio.create_task(
            kernel_manager.start_kernel(
                kernel_id=kernel_id,
                kernel_name=kernel_name,
                force_new_pod=force_new_pod,
                pod_pool=self.pod_pool,
                api_client=self.api_client,
            )  # type: ignore[arg-type]
        )
        try:
            await awaitable
        except Exception:
            try:
                os.remove(os.path.join(self.connection_dir, f"{kernel_id}.json"))
            except FileNotFoundError:
                pass
            raise
        finally:
            del self.starting_kernels[kernel_id]

        assert isinstance(kernel_manager, AsyncIOLoopKernelManager)
        if kernel_manager.ready.exception():
            raise kernel_manager.ready.exception()  # type: ignore
        self.kernels[kernel_id] = kernel_manager
        self.start_watching_activity(kernel_id)

    def get_kernel(self, kernel_id: str) -> AsyncIOLoopKernelManager:
        return self.kernels[kernel_id]

    async def shutdown_kernel(self, kernel_id: str, now: bool = False) -> None:
        kernel = self.kernels[kernel_id]
        await kernel.shutdown_kernel(now=now)
        self.remove_kernel(kernel_id)

    def remove_kernel(self, kernel_id: str) -> None:
        self.kernels.pop(kernel_id, None)
        if tracker := self.activity_trackers.pop(kernel_id, None):
            tracker.activity_stream.on_recv(None)  # type: ignore

    def start_watching_activity(self, kernel_id: str) -> None:
        kernel = self.kernels[kernel_id]
        stream = kernel.connect_iopub()
        self.activity_trackers[kernel_id] = KernelActivityTracker(
            last_activity=utcnow(),
            last_user_activity=None,
            activity_stream=stream,
        )
        session = Session(
            config=kernel.session.config,
            key=b"",
        )

        def record_activity(msg_list: list[bytes]) -> None:
            idents, fed_msg_list = session.feed_identities(msg_list)
            msg = session.deserialize(fed_msg_list, content=False)
            if msg["msg_type"] != "status":
                return

            now = utcnow()
            if tracker := self.activity_trackers.get(kernel_id):
                tracker.last_activity = now
                session_info = NeptyneSessionInfo.from_message_header(
                    msg["parent_header"]
                )
                if session_info.user_email:
                    tracker.last_user_activity = now
            else:
                stream.on_recv(None)

        stream.on_recv(record_activity)

    def kernel_model(self, kernel_id: str) -> dict[str, Any]:
        kernel = self.kernels[kernel_id]
        activity = self.activity_trackers[kernel_id]

        model = {
            "id": kernel_id,
            "name": kernel.kernel_name,
            "last_activity": activity.last_activity.isoformat(),
            "last_user_activity": activity.last_user_activity.isoformat()
            if activity.last_user_activity is not None
            else None,
        }
        return model

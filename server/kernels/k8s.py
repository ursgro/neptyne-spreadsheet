import asyncio
import logging
import os
import queue
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from jupyter_client import KernelConnectionInfo, KernelProvisionerBase
from kubernetes_asyncio import client
from kubernetes_asyncio.client import ApiException
from opentelemetry import trace

from neptyne_kernel.launch_ipykernel import (
    CONTROL_PORT,
    HB_PORT,
    IOPUB_PORT,
    SHELL_PORT,
    STDIN_PORT,
)
from server.k8s_annotations import (
    ANNOTATION_CLAIMED_AT,
    ANNOTATION_LAST_ACTIVITY,
    ANNOTATION_LAST_HEARTBEAT,
    ANNOTATION_LAST_USER_ACTIVITY,
)
from server.kernel_protocol_version import KERNEL_PROTOCOL_VERSION
from server.kernels.python_kubernetes.launch_kubernetes import (
    launch_kubernetes_kernel,
)

KERNEL_NAMESPACE = os.getenv("KERNEL_NAMESPACE", "default")
KERNEL_IMAGE = "neptyne-kernel"
KERNEL_VERSION_TAG = "1.0"

KERNEL_ID_LABEL = "kernel_id"
KERNEL_VERSION_LABEL = "kernel_version"
KERNEL_PROTOCOL_LABEL = "kernel_protocol"

SHARD_INDEX_LABEL = "shard_index"

logger = logging.getLogger(__file__)
tracer = trace.get_tracer(__name__)


def escape_jsonpatch(value: str) -> str:
    return value.replace("~", "~0").replace("/", "~1")


def compatible_protocol(pod_info: client.V1Pod) -> bool:
    protocol = pod_info.metadata.labels.get(KERNEL_PROTOCOL_LABEL)
    # remove "is None" when we don't need this backwards-compatibility
    return protocol == KERNEL_PROTOCOL_VERSION or protocol is None


@dataclass
class KernelPod:
    name: str
    ip: str
    key: str

    @classmethod
    def from_pod_info(cls, pod_info: client.V1Pod) -> "KernelPod":
        return cls(
            pod_info.metadata.name,
            pod_info.status.pod_ip,
            pod_info.metadata.annotations["key"],
        )


@dataclass
class PendingPod:
    name: str
    created_at: datetime = field(default_factory=datetime.now)


PodPhase = Literal["Failed", "Pending", "Running", "Succeeded", "Unknown"]


async def get_pod(
    pod_name: str, api: client.ApiClient
) -> tuple[PodPhase, client.V1Pod | None]:
    try:
        pod = await client.CoreV1Api(api).read_namespaced_pod(
            pod_name, KERNEL_NAMESPACE
        )
    except ApiException as e:
        logger.info("error querying pod: %s", e)
        return "Unknown", None

    return pod.status.phase, pod


class KernelPodPool:
    pods: queue.SimpleQueue
    pending_pods: list[PendingPod]
    shard_index: int
    pod_maintainer_task: asyncio.Task | None

    def __init__(self, size: int, shard_index: int) -> None:
        self.desired_size = size
        self.pods = queue.SimpleQueue()
        self.pending_pods = []
        self.shard_index = shard_index

        self.pod_maintainer_task = None

    def get_label_selector(self, *, match_version: bool) -> str:
        match_version_op = "=" if match_version else "!="
        return ",".join(
            [
                "component=kernel",
                f"{KERNEL_VERSION_LABEL}{match_version_op}{KERNEL_VERSION_TAG}",
                f"{SHARD_INDEX_LABEL}={self.shard_index}",
                f"!{KERNEL_ID_LABEL}",
            ]
        )

    async def adjust_pod_pool(self, api: client.ApiClient) -> None:
        if self.pending_pods:
            pending_pod = self.pending_pods.pop(0)
            pod_phase, pod = await get_pod(pending_pod.name, api)
            if pod is None:
                if datetime.now() - pending_pod.created_at > timedelta(seconds=10):
                    logger.info(
                        "dropping %s from queue: " "could not query within 10 seconds",
                        pending_pod.name,
                    )
                else:
                    self.pending_pods.append(pending_pod)
                return

            logger.debug("pod %s in phase %s", pending_pod.name, pod_phase)

            if pod_phase == "Running":
                self.pods.put(KernelPod.from_pod_info(pod))
            elif pod_phase == "Pending":
                self.pending_pods.append(pending_pod)
            else:
                logger.error(
                    f"Unexpected pod phase: {pod_phase=} {pending_pod.name=}",
                )

        await self.cleanup_pods(api)

        queue_size = self.pods.qsize() + len(self.pending_pods)
        if queue_size < self.desired_size:
            logger.debug("queue size is %s, creating pod", queue_size)
            num_pods_to_create = self.desired_size - queue_size
            for _ in range(num_pods_to_create):
                logger.debug("creating pod")
                self.pending_pods.append(await self.launch_kernel_pod(api))
        elif not self.pending_pods:
            await asyncio.sleep(0.5)

    async def pod_loop(self, api: client.ApiClient) -> None:
        retry_sleep = 1
        while True:
            try:
                await self.adjust_pod_pool(api)
                retry_sleep = 1
            except Exception as e:
                logger.exception(e)
                await asyncio.sleep(retry_sleep)
                retry_sleep = min(retry_sleep * 2, 30)

    async def cleanup_pods(self, api: client.ApiClient) -> None:
        # Delete any pods not running kernels that don't match our version, but only if they've
        # been around for a while to avoid deleting pods that belong to a new version of the
        # server
        now = datetime.now(timezone.utc)
        label_selector = self.get_label_selector(match_version=False)
        for pod in (
            await client.CoreV1Api(api).list_namespaced_pod(
                namespace=KERNEL_NAMESPACE,
                label_selector=label_selector,
            )
        ).items:
            age = now - pod.metadata.creation_timestamp
            if (
                pod.status.phase == "Running"
                and not pod.metadata.deletion_timestamp
                and age > timedelta(minutes=5)
            ):
                logger.info(
                    "deleting pod %s because it is not running a kernel "
                    "that matches the current version",
                    pod.metadata.name,
                )
                await client.CoreV1Api(api).delete_namespaced_pod(
                    pod.metadata.name, KERNEL_NAMESPACE
                )

    async def launch_kernel_pod(self, api_client: client.ApiClient) -> PendingPod:
        name = f"kernel-{uuid.uuid4()}"
        key = str(uuid.uuid4())
        logger.debug("launching pod %s, version %s", name, KERNEL_VERSION_TAG)
        await launch_kubernetes_kernel(
            api_client,
            pod_name=name,
            namespace=KERNEL_NAMESPACE,
            kernel_image=KERNEL_IMAGE,
            kernel_key=key,
            version_tag=KERNEL_VERSION_TAG,
            shard_index=self.shard_index,
        )
        return PendingPod(name)

    async def get_new_kernel_pod(
        self, api: client.ApiClient, timeout: float = 180.0
    ) -> KernelPod:
        pending_pod = await self.launch_kernel_pod(api)
        deadline = pending_pod.created_at + timedelta(seconds=timeout)
        while datetime.now() < deadline:
            pod_phase, pod_info = await get_pod(pending_pod.name, api)
            if pod_phase == "Running":
                pod = KernelPod.from_pod_info(pod_info)
                break
            else:
                await asyncio.sleep(0.2)
        else:
            raise TimeoutError("could not get a running pod in time")
        return pod

    async def start(self, api_client: client.ApiClient) -> None:
        await self._discover(api_client)
        self.pod_maintainer_task = asyncio.create_task(self.pod_loop(api_client))

    async def _discover(self, api: client.ApiClient) -> None:
        label_selector = self.get_label_selector(match_version=True)
        pods = await client.CoreV1Api(api).list_namespaced_pod(
            namespace=KERNEL_NAMESPACE,
            label_selector=label_selector,
        )
        for pod in pods.items:
            if pod.status.phase == "Running":
                self.pods.put(KernelPod.from_pod_info(pod))

    async def get(self, api: client.ApiClient, timeout: int = 300) -> KernelPod:
        try:
            pod = self.pods.get(block=False)
            pod_info = await get_pod(pod.name, api)
            if pod_info:
                phase, _ = pod_info
                if phase == "Running":
                    return pod
        except (queue.Empty, ApiException):
            pass

        # No pod is available from the pool. Create a new one.
        return await self.get_new_kernel_pod(api, timeout)


def make_connection_info(ip: str, key: str) -> KernelConnectionInfo:
    return {
        "shell_port": SHELL_PORT,
        "iopub_port": IOPUB_PORT,
        "stdin_port": STDIN_PORT,
        "control_port": CONTROL_PORT,
        "hb_port": HB_PORT,
        "ip": ip,
        "transport": "tcp",
        "kernel_name": "",
        "key": key.encode(),
        "signature_scheme": "hmac-sha256",
    }


class NeptyneK8sProvisioner(KernelProvisionerBase):  # type: ignore
    pod_name: str | None
    pod_pool: KernelPodPool | None
    api_client: client.ApiClient | None
    last_heartbeat: datetime | None

    def __init__(
        self,
        parent: Any,
        **kwargs: Any,
    ):
        self.pod_pool = None
        self.api_client = None
        self.pod_name = None
        self.last_heartbeat = None
        super().__init__(parent=parent, **kwargs)

    @classmethod
    def load(cls) -> type:
        # To fit the kernel provisioner loader interface
        return cls

    @property
    def has_process(self) -> bool:
        return self.pod_name is not None

    async def poll(self) -> int | None:
        if self.pod_name is None:
            return 1
        pod_phase, pod_info = await get_pod(self.pod_name, self.api_client)
        if pod_info is None:
            return 1
        if status := pod_info.status:
            if status.phase == "Running":
                # Yes this is odd, but it is the interface prescribed by KernelProvisionerBase
                return None
            elif status.container_statuses:
                for container_status in pod_info.status.container_statuses:
                    if (
                        container_status.name == self.pod_name
                        and container_status.state
                        and container_status.state.terminated
                    ):
                        return container_status.state.terminated.exit_code

        return 1

    async def wait(self) -> int | None:
        for i in range(60):
            ret = await self.poll()
            if ret is not None:
                return ret
            await asyncio.sleep(1)
        raise TimeoutError("timed out waiting for kernel to terminate")

    async def send_signal(self, signum: int) -> None:
        await self.terminate_kernel_pod()

    async def kill(self, restart: bool = False) -> None:
        await self.terminate_kernel_pod()

    async def terminate(self, restart: bool = False) -> None:
        await self.terminate_kernel_pod()

    async def terminate_kernel_pod(self) -> None:
        body = client.V1DeleteOptions(
            grace_period_seconds=0, propagation_policy="Background"
        )

        try:
            await client.CoreV1Api(self.api_client).delete_namespaced_pod(
                namespace=KERNEL_NAMESPACE, body=body, name=self.pod_name
            )
        except ApiException as err:
            if err.status == 404:
                pass
            else:
                raise

    async def pre_launch(self, **kwargs: Any) -> dict[str, Any]:
        kwargs["cmd"] = ["not_used"]  # Seems kernel manager expects something here
        self.pod_pool = kwargs.pop("pod_pool")
        self.api_client = kwargs.pop("api_client")
        return await super().pre_launch(**kwargs)

    async def launch_kernel(
        self, cmd: list[str], **kwargs: Any
    ) -> KernelConnectionInfo:
        assert self.pod_pool is not None
        existing_pods = await client.CoreV1Api(self.api_client).list_namespaced_pod(
            namespace=KERNEL_NAMESPACE,
            label_selector=f"component=kernel,{KERNEL_ID_LABEL}={self.kernel_id}",
        )
        if existing_pods and existing_pods.items:
            for pod in existing_pods.items:
                if compatible_protocol(pod) and pod.status.phase in (
                    "Pending",
                    "Running",
                ):
                    self.connection_info = make_connection_info(
                        pod.status.pod_ip, pod.metadata.annotations["key"]
                    )
                    self.pod_name = pod.metadata.name
                    return self.connection_info

        if kwargs.pop("force_new_pod", False):
            pod = await self.pod_pool.get_new_kernel_pod(self.api_client)
        else:
            with tracer.start_as_current_span("get_kernel_pod_from_pool"):
                pod = await self.pod_pool.get(self.api_client)
        self.pod_name = pod.name
        await client.CoreV1Api(self.api_client).patch_namespaced_pod(
            pod.name,
            KERNEL_NAMESPACE,
            [
                {
                    "op": "add",
                    "path": f"/metadata/labels/{KERNEL_ID_LABEL}",
                    "value": self.kernel_id,
                },
                {
                    "op": "add",
                    "path": f"/metadata/annotations/{escape_jsonpatch(ANNOTATION_CLAIMED_AT)}",
                    "value": datetime.now(timezone.utc).isoformat(),
                },
            ],
        )
        self.connection_info = make_connection_info(pod.ip, pod.key)
        return self.connection_info

    async def sync_activity(
        self, last_activity: datetime, last_user_activity: datetime | None
    ) -> None:
        await client.CoreV1Api(self.api_client).patch_namespaced_pod(
            self.pod_name,
            KERNEL_NAMESPACE,
            [
                {
                    "op": "add",
                    "path": f"/metadata/annotations/{escape_jsonpatch(ANNOTATION_LAST_ACTIVITY)}",
                    "value": last_activity.isoformat(),
                },
                {
                    "op": "add",
                    "path": f"/metadata/annotations/{escape_jsonpatch(ANNOTATION_LAST_USER_ACTIVITY)}",
                    "value": last_user_activity.isoformat()
                    if last_user_activity
                    else None,
                },
                {
                    "op": "add",
                    "path": f"/metadata/annotations/{escape_jsonpatch(ANNOTATION_LAST_HEARTBEAT)}",
                    "value": self.last_heartbeat.isoformat()
                    if self.last_heartbeat
                    else None,
                },
            ],
        )

    def set_last_heartbeat(self, last_heartbeat: datetime) -> None:
        self.last_heartbeat = last_heartbeat

    async def cleanup(self, restart: bool = False) -> None:
        await self.terminate_kernel_pod()

    async def get_provisioner_info(self) -> dict[str, Any]:
        info = await super().get_provisioner_info()
        info.update({"pod_name": self.pod_name})
        return info

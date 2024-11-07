from typing import Any

from jupyter_client import KernelConnectionInfo, LocalProvisioner


class NeptyneLocalProvisioner(LocalProvisioner):  # type: ignore
    @classmethod
    def load(cls) -> type:
        # To fit the kernel provisioner loader interface
        return cls

    async def launch_kernel(
        self, cmd: list[str], **kwargs: Any
    ) -> KernelConnectionInfo:
        # We need to remove our custom args from here so the Jupyter provisioner doesn't fail
        kwargs.pop("force_new_pod", None)
        kwargs.pop("kernel_name", None)
        kwargs.pop("pod_pool", None)
        kwargs.pop("api_client", None)
        return await super().launch_kernel(cmd, **kwargs)

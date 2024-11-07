from jupyter_client.kernelspec import KernelSpec, KernelSpecManager

from neptyne_kernel.kernel import pythonpath_with_kernel_module
from neptyne_kernel.launch_ipykernel import get_config_args


class NeptyneKernelSpecManager(KernelSpecManager):
    def __init__(self, env: dict[str, str] | None = None):
        super().__init__()
        self.env = env or {}

    def get_kernel_spec(self, kernel_name: str) -> KernelSpec:
        if kernel_name == "python_kubernetes":
            return KernelSpec(
                display_name="Python",
                language="python",
                metadata={
                    "kernel_provisioner": {
                        "provisioner_name": "neptyne-k8s",
                    },
                },
                env={},
                interrupt_mode="message",
            )
        elif kernel_name == "python_local":
            # This is basically the "native" kernel spec, but we provide an exec_lines that
            # includes our kernel initialization
            return KernelSpec(
                display_name="Python",
                language="python",
                metadata={
                    "debugger": True,
                },
                env={
                    "PYTHONPATH": pythonpath_with_kernel_module(),
                    **self.env,
                },
                argv=[
                    "python",
                    "-m",
                    "ipykernel_launcher",
                    "--no-secure",
                    "-f",
                    "{connection_file}",
                    *get_config_args(),
                ],
            )
        else:
            raise ValueError(f"Unsupported kernel {kernel_name}")

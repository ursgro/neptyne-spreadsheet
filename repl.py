#!/usr/bin/env python3
import argparse
import os
import subprocess
import time
from contextlib import ExitStack
from typing import Iterable

from jupyter_console.app import ZMQTerminalIPythonApp

from neptyne_kernel.launch_ipykernel import determine_connection_file

script_dir = os.path.dirname(__file__)


def choose_available_ports(n: int) -> Iterable[int]:
    import socket

    with ExitStack() as stack:
        for _ in range(n):
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            stack.enter_context(s)
            s.bind(("localhost", 0))
            yield s.getsockname()[1]


def launch_kernel(connection_file: str) -> None:
    env = dict(os.environ)
    if pythonpath := env.get("PYTHONPATH"):
        pythonpath += os.pathsep + script_dir
    else:
        pythonpath = script_dir
    env["PYTHONPATH"] = pythonpath
    env["NEPTYNE_LOCAL_REPL"] = "1"

    ports = iter([str(p) for p in choose_available_ports(5)])
    subprocess.Popen(
        [
            "python",
            os.path.join(script_dir, "neptyne_kernel", "launch_ipykernel.py"),
            "--key",
            "0",
            "--connection-file",
            connection_file,
            "--shell-port",
            next(ports),
            "--iopub-port",
            next(ports),
            "--stdin-port",
            next(ports),
            "--hb-port",
            next(ports),
            "--control-port",
            next(ports),
            "--quiet",
        ],
        env=env,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-key", type=str, required=True)
    args = parser.parse_args()
    connection_file = determine_connection_file()
    launch_kernel(connection_file)
    for i in range(5):
        if os.path.exists(connection_file):
            with open(connection_file) as f:
                value = f.read()
                if value.strip():
                    break
        time.sleep(1)
    else:
        raise ValueError("Kernel did not start")

    app = ZMQTerminalIPythonApp.instance(existing=connection_file)
    app.initialize(())
    kernel_client = app.shell.client
    kernel_client.execute_interactive(f"N_.do_repl_init({args.api_key!r})")

    try:
        app.start()
    finally:
        app.shell.client.shutdown()


if __name__ == "__main__":
    main()

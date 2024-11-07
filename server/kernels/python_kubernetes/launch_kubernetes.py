import os
from typing import Any

import yaml
from jinja2 import Environment, FileSystemLoader
from kubernetes_asyncio import client, config

from server.kernel_protocol_version import KERNEL_PROTOCOL_VERSION

KERNEL_POD_TEMPLATE_PATH = "/kernel-pod.yaml.jinja2"


def generate_kernel_pod_yaml(**keywords: Any) -> str:
    j_env = Environment(
        loader=FileSystemLoader(os.path.dirname(__file__)),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    k8s_yaml = j_env.get_template(KERNEL_POD_TEMPLATE_PATH).render(**keywords)

    return k8s_yaml


async def launch_kubernetes_kernel(
    api_client: client.ApiClient,
    pod_name: str,
    namespace: str,
    kernel_image: str,
    kernel_key: str,
    version_tag: str,
    shard_index: int,
) -> None:
    # Launches a containerized kernel as a kubernetes pod.
    config.load_incluster_config()

    # Substitute all template variable (wrapped with {{ }}) and generate `yaml` string.
    k8s_yaml = generate_kernel_pod_yaml(
        kernel_pod_name=pod_name,
        kernel_namespace=namespace,
        kernel_name="python_kubernetes",
        kernel_image=kernel_image,
        kernel_key=kernel_key,
        kernel_version=version_tag,
        shard_index=shard_index,
        kernel_protocol_version=KERNEL_PROTOCOL_VERSION,
    )

    k8s_obj = yaml.safe_load(k8s_yaml)
    await client.CoreV1Api(api_client).create_namespaced_pod(
        body=k8s_obj, namespace=namespace
    )

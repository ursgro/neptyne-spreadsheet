import subprocess
import sys
from pathlib import Path

import requests


def camel_to_snake(name):
    return "".join(["_" + c.lower() if c.isupper() else c for c in name]).lstrip("_")


def flatten_schema(schemas, object, path=()):
    if "$ref" in object:
        yield path, object["$ref"]
        schema = schemas[object["$ref"]]
        for prop, value in schema["properties"].items():
            yield from flatten_schema(schemas, value, (*path, prop))
    else:
        yield path, object["type"]


METHOD_PATTERN = '''
def {method_name_snake}({param_list}):
    """{docstring}
    """
    body = {{{param_body}}}

    mappable_types = {type_directory}

    return _request("{method_name}", body, mappable_types)
'''

REQUEST_FUNC = """
def _request(method, body, mappable_types):
    from ...dash import Dash
    body = {k: v for k, v in body.items() if v is not _UNSPECIFIED}
    return Dash.instance().google_sheets_request(method, body, mappable_types)
"""

UNSPECIFIED_CLASS = """
class _Unspecified:
    def __repr__(self):
        return "None"


_UNSPECIFIED = _Unspecified()
"""


MAPPED_TYPES = ("GridRange", "GridCoordinate")


def codegen(file=sys.stdout):
    doc = requests.get(
        "https://sheets.googleapis.com/$discovery/rest?version=v4"
    ).json()
    schemas = doc["schemas"]
    batch_methods = schemas["Request"]["properties"]
    print(UNSPECIFIED_CLASS, file=file)
    print(file=file)
    print(REQUEST_FUNC, file=file)

    all_methods = []
    for name, schema in batch_methods.items():
        params = []
        request_object_name = schema["$ref"]
        request_schema = schemas[request_object_name]

        method_name_snake = camel_to_snake(name)
        all_methods.append(method_name_snake)

        type_directory = {
            ".".join(path): typ
            for path, typ in flatten_schema(schemas, schema)
            if typ in MAPPED_TYPES
        }

        has_fields = False
        for prop in request_schema["properties"]:
            default = '"*"' if prop == "fields" else "_UNSPECIFIED"
            params.append((prop, default))
        if has_fields:
            pass
        docstring = "\n        ".join(
            [
                request_schema["description"],
                "",
                f"[Link](https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/request#{request_object_name})",
            ]
        )
        py_param_list = ", ".join(
            f"{camel_to_snake(p)}={default}" for p, default in params
        )
        api_request_body = ", ".join(
            f'"{p}": {camel_to_snake(p)}' for p, _default in params
        )
        print(
            METHOD_PATTERN.format(
                method_name=name,
                method_name_snake=method_name_snake,
                param_list=py_param_list,
                docstring=docstring,
                param_body=api_request_body,
                type_directory=type_directory,
            ),
            file=file,
        )

    print(f"__all__ = {all_methods!r}", file=file)


def main():
    out_path = (
        Path(__file__).parent.parent
        / "server"
        / "neptyne_kernel"
        / "neptyne_api"
        / "google"
        / "sheets.py"
    )
    codegen(out_path.open("w"))
    subprocess.call(["black", out_path])


if __name__ == "__main__":
    main()

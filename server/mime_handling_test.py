import base64
import builtins
import datetime
import json
import types

import numpy as np
import pandas as pd
import pytest
import pytz
from IPython import InteractiveShell
from PIL import Image

from neptyne_kernel.mime_handling import (
    MimeBundle,
    datetime_bundle,
    decode_date,
    encode_for_gsheets,
    maybe_format_common_values,
    outputs_to_value,
)
from neptyne_kernel.mime_types import DATETIME_KEY
from neptyne_kernel.primitives import Empty
from neptyne_kernel.spreadsheet_error import VALUE_ERROR
from neptyne_kernel.widgets.input_widgets import Button, Dropdown, Slider
from neptyne_kernel.widgets.output_widgets import Bar, Line, Pie, Scatter


@pytest.mark.parametrize(
    "object, attributes",
    [
        (Image.new("RGB", (100, 100)), ["width", "height"]),
        ("hello", []),
        (11238, []),
        (VALUE_ERROR, ["ename", "msg"]),
        (Button("Click", None), ["caption"]),
        (Dropdown(["1", "2", "3"], None, "1"), ["value"]),
        (Slider(None, 50), ["value"]),
        (
            Scatter(x=[1, 2], y=[3, 4], title="Title"),
            ["title"],
        ),
        (Bar(x=[1, 2], y=[3, 4], x_label="values"), ["x_label"]),
        (Line([1, 2], x=[3, 4], title="Title"), ["title"]),
        (Pie([3, 4], labels=["1", "2"], donut=False), ["donut"]),
    ],
)
def test_back_and_forth(object, attributes):
    format_data = InteractiveShell.instance().displayhook.compute_format_data
    mime = format_data(object)

    def b64_dict(d: MimeBundle) -> MimeBundle:
        return {
            k: base64.b64encode(v) if isinstance(v, bytes) else v for k, v in d.items()
        }

    mime = [b64_dict(d) for d in mime]

    try:
        builtins.get_ipython = lambda: types.SimpleNamespace(
            parent_header={"header": None}
        )
        decoded = outputs_to_value(mime)
    finally:
        del builtins.get_ipython

    if not attributes:
        assert str(decoded) == str(object)

    for attribute in attributes:
        assert getattr(object, attribute) == getattr(decoded, attribute)


@pytest.mark.parametrize(
    "thing, should_render",
    [
        (Image.new("RGB", (100, 100)), False),
        ("hello", False),
        (Button, True),
        (test_back_and_forth, True),
        (base64, True),
        (abs, True),
        (str, True),
    ],
)
def test_maybe_format_common_values(thing, should_render):
    rendered = maybe_format_common_values(thing)
    if should_render:
        assert rendered.startswith("<")
        assert rendered.endswith(">")
    else:
        assert rendered == thing


@pytest.mark.parametrize(
    "value, expected_content_type, expected_encoded",
    [
        (Empty.MakeItSo, "application/json", None),
        (
            pd.DataFrame(
                {
                    "Column1": [1, 2, 3],
                    "Column2": ["a", "b", "c"],
                    "Column3": [4.0, 5.0, 6.0],
                },
                index=["Row1", "Row2", "Row3"],
            ),
            "application/json",
            [
                ["", "Column1", "Column2", "Column3"],
                ["Row1", 1, "a", 4.0],
                ["Row2", 2, "b", 5.0],
                ["Row3", 3, "c", 6.0],
            ],
        ),
        (
            datetime.datetime(
                2022, 3, 1, 12, 34, 56, tzinfo=pytz.timezone("US/Eastern")
            ),
            "application/json",
            {"dateString": "2022-03-01T12:34:56-04:56", "type": "date"},
        ),
        (
            [
                datetime.datetime(
                    2022, 1, 1, 12, 34, 53, tzinfo=pytz.timezone("US/Eastern")
                ),
                datetime.datetime(
                    2023, 1, 2, 12, 34, 52, tzinfo=pytz.timezone("US/Eastern")
                ),
            ],
            "application/json",
            [
                {"dateString": "2022-01-01T12:34:53-04:56", "type": "date"},
                {"dateString": "2023-01-02T12:34:52-04:56", "type": "date"},
            ],
        ),
        ((x for x in range(5)), "application/json", [0, 1, 2, 3, 4]),
        ({"a": 1, "b": 2}, "application/json", [["a", 1], ["b", 2]]),
        (np.array([1, 2, 3]), "application/json", [1, 2, 3]),
        (
            pd.Series([10, 20, 30], name="Values"),
            "application/json",
            [["", "Values"], [0, 10], [1, 20], [2, 30]],
        ),
        ({1, 2, 3}, "application/json", [1, 2, 3]),
        ("text value", "application/json", "text value"),
        (
            pd.DataFrame.from_records(
                [{"foo": 1, "bar": "hello"}, {"foo": 2, "bar": "goodbye"}]
            ),
            "application/json",
            [["foo", "bar"], [1, "hello"], [2, "goodbye"]],
        ),
        (
            pd.DataFrame.from_records(
                [{"foo": 1, "bar": "hello"}, {"foo": [1, 2], "bar": {"baz": "qux"}}]
            ),
            "application/json",
            [["foo", "bar"], [1, "hello"], ["[1, 2]", "{'baz': 'qux'}"]],
        ),
        (1, "application/json", 1),
        (
            {"A": 3, "B": [3, [5, 6]]},
            "application/json",
            [["A", 3], ["B", "[3, [5, 6]]"]],
        ),
        ([[1, [1, 3]]], "application/json", [[1, "[1, 3]"]]),
        (
            ["abc", ["def", ["ghi", "jkl"]]],
            "application/json",
            ["abc", ["def", "['ghi', 'jkl']"]],
        ),
    ],
)
def test_encode_for_gsheets(value, expected_content_type, expected_encoded):
    content_type, encoded = encode_for_gsheets(value)
    assert content_type == expected_content_type
    assert json.loads(encoded) == expected_encoded


@pytest.mark.parametrize(
    "test_input,expected",
    [
        (datetime.datetime.now(), "datetime"),
        (datetime.date.today(), "date"),
        (datetime.datetime.now().time(), "time"),
    ],
)
def test_datetime_bundled(test_input, expected):
    bundle = datetime_bundle(test_input)
    assert bundle[DATETIME_KEY]["type"] == expected

    value = decode_date(bundle[DATETIME_KEY])

    assert value == test_input

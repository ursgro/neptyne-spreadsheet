import pytest

from neptyne_kernel.cell_address import Address
from neptyne_kernel.tyne_model.sheet import Sheet
from server.codeassist import (
    find_inserted_lines,
    maybe_inline_code,
    merge_code_reply,
    split_sheet_writes,
)

COMPLETIONS = {
    "Jan;Piet;Joris": "Corneel",
    "John Lennon;Paul McCartney": "George Harrison\nRingo Starr",
    "John Lennon,Guitar;Paul McCartney,Piano": "George Harrison\tGuitar",
    "John Lennon,Piano,October 9;Paul McCartney,Guitar,June 18;George Harrison": "Guitar\tFebruary 25",
    "John Lennon,Piano,October 9;Paul McCartney,Guitar,June 18;Ringo Starr": "Drums\tJuly 7",
    "California;New York;Georgia": "California\nNew York\nGeorgia\nAlaska\nArizona",
    "New York,Albany;Georgia,Atlanta;Texas": "Texas\tAustin",
}


async def mock_open_ai(prompt, *args, **kwargs):
    key = prompt.strip()
    key = key.split("\n", 1)[-1].strip()
    key = key.replace("\n", ";")
    key = key.replace("\t", ",")
    return COMPLETIONS[key] + "\n"


def test_maybe_inline_code():
    assert (
        maybe_inline_code(
            ["B1", "B2"], "def profit(revenue, costs):\n    return revenue - costs"
        )
        == "B1 - B2"
    )


@pytest.mark.parametrize(
    ("new_text", "old_text", "changed_lines"),
    [("a\nb\nc", "a\nb\nc", []), ("a\nb\nc", "a\nc", [1]), ("a\nb\nc", "a\nb", [2])],
)
def test_find_inserted_lines(new_text, old_text, changed_lines):
    assert find_inserted_lines(new_text, old_text) == changed_lines


@pytest.mark.parametrize(
    ("codex_code", "cells_to_update", "expected_result_lines"),
    [
        ("foo()", [], ["foo()"]),
        ("A1 := foo()", [(Address(0, 0, 0), "foo()")], []),
        ("Sheet0 := foo()", [], ["Sheet0 := foo()"]),
        ("PLAYER1 := foo()", [], ["PLAYER1 := foo()"]),
        ("AA1 := foo()", [], ["AA1 := foo()"]),
        ("Z1 := foo()", [(Address(25, 0, 0), "foo()")], []),
    ],
)
def test_split_sheet_writes(codex_code, cells_to_update, expected_result_lines):
    sheets = {0: Sheet(0, "Sheet1")}
    result_lines, cell_updates = split_sheet_writes(codex_code, sheets)
    assert [(cell, code) for cell, code, _, _ in cell_updates] == cells_to_update
    assert expected_result_lines == result_lines


@pytest.mark.parametrize(
    ("old_code", "new_code", "expected_code"),
    [
        (
            "def foo():\n" "    pass",
            "def foo():\n" "    return x",
            "def foo():\n" "    return x",
        ),
        (
            "def foo():\n" "    pass",
            "def bar():\n" "    return x",
            "def foo():\n" "    pass\n\n" "def bar():\n" "    return x",
        ),
        (
            "import os\n\ndef foo():\n" "    pass",
            "def foo():\n" "    return x",
            "import os\ndef foo():\n" "    return x",
        ),
        (
            "import sys\nx = 5",
            "import os\nx = 10",
            "import sys\nimport os\nx = 10",
        ),
        (
            "class MyClass:\n    pass",
            "class YourClass:\n    pass",
            "class MyClass:\n    pass\n\nclass YourClass:\n    pass",
        ),
        (
            "def foo(x):\n    return x",
            "def foo(y):\n    return y\n\ndef bar():\n    pass",
            "def foo(y):\n    return y\n\ndef bar():\n    pass",
        ),
        (
            "from math import pi",
            "from os import path",
            "from math import pi\nfrom os import path",
        ),
        (
            "def foo():\n    pass",
            "def foo(]:\n    pass",
            None,
        ),
        (
            "",
            "def foo():\n    return x",
            "def foo():\n    return x",
        ),
        (
            "def foo():\n    pass",
            "",
            "def foo():\n    pass",
        ),
        (
            "# Comment 1\nx = 5\n!pip install numpy",
            "# Comment 2\ny = 10",
            "# Comment 1\nx = 5\n!pip install numpy\n\n# Comment 2\ny = 10",
        ),
        (
            "def fastest_cars():\n"
            "    url = 'https://en.wikipedia.org/wiki/List_of_fastest_production_cars'\n"
            "    return pd.read_html(url)[0]",
            "def fastest_cars():\n"
            "    url = 'https://en.wikipedia.org/wiki/List_of_fastest_production_cars'\n"
            "    return pd.read_html(url)[0]"
            "\n"
            "!pip install seaborn",
            "def fastest_cars():\n"
            "    url = 'https://en.wikipedia.org/wiki/List_of_fastest_production_cars'\n"
            "    return pd.read_html(url)[0]"
            "\n"
            "!pip install seaborn",
        ),
    ],
)
def test_merge_code_reply(old_code, new_code, expected_code):
    merged = merge_code_reply(old_code, new_code)
    assert merged == expected_code

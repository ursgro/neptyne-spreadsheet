import pytest

from server.sheet_linter import grids_to_text


@pytest.mark.parametrize(
    "grids,expected",
    [
        ([], ""),
        (
            [("Sheet1", [["aap", "noot", "mies"], ["wim", "zus", "jet"]])],
            "name: Sheet1\nA1←aap|B1←noot|C1←mies\nA2←wim|B2←zus|C2←jet",
        ),
        (
            [("Sheet1", [["aap", "noot", "mies"]]), ("Sheet2", [["", "", ""]])],
            "name: Sheet1\nA1←aap|B1←noot|C1←mies",
        ),
    ],
)
def test_grids_to_text(grids, expected):
    txt = grids_to_text(grids)
    assert txt == expected

from typing import Any

import pytest

from server.messages import cell_or_range_for_completion


@pytest.mark.parametrize(
    "code, cursor_pos, expected",
    [
        ("A1.", -1, "A1"),
        (" A1. ", -1, None),
        ("", -1, None),
        ("Sheet!C4.", -1, "C4"),
        ("hello(B2.)", 9, "B2"),
        ("hello( A1.)", 10, "A1"),
        (" A1:C2.", -1, "A1:C2"),
        ("hello(A1:C2.)", 12, "A1:C2"),
    ],
)
def test_cell_id_completion(code, cursor_pos, expected):
    def completion_msg(code: str, cursor_pos: int = -1) -> dict[str, Any]:
        if cursor_pos == -1:
            cursor_pos = len(code)
        return {
            "content": {
                "code": code,
                "cursor_pos": cursor_pos,
            }
        }

    assert cell_or_range_for_completion(completion_msg(code, cursor_pos)) == expected

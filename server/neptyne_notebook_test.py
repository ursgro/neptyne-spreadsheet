import pytest

from neptyne_kernel.neptyne_protocol import Dimension, SheetTransform
from neptyne_kernel.transformation import Transformation
from server.neptyne_notebook import TyneNotebook


def notebook(code):
    nb = TyneNotebook([])
    nb.cells[0].raw_code = code
    return nb


@pytest.mark.parametrize(
    "init_code, transformation, sheet_name, expected",
    [
        (
            "def foo():return B2",
            Transformation(
                Dimension.ROW, SheetTransform.DELETE, index=0, amount=1, sheet_id=0
            ),
            "",
            "def foo():return B1",
        ),
        (
            "def foo():return B2",
            Transformation(
                Dimension.ROW,
                SheetTransform.INSERT_BEFORE,
                index=0,
                amount=1,
                sheet_id=0,
            ),
            "",
            "def foo():return B3",
        ),
        (
            "def foo():return Sheet2!B2",
            Transformation(
                Dimension.ROW, SheetTransform.DELETE, index=0, amount=1, sheet_id=1
            ),
            "Sheet2",
            "def foo():return Sheet2!B1",
        ),
        (
            "def foo():return Sheet2!B2",
            Transformation(
                Dimension.ROW, SheetTransform.DELETE, index=0, amount=1, sheet_id=1
            ),
            "Sheet1",
            None,
        ),
        (
            "def foo():return B2",
            Transformation(
                Dimension.ROW, SheetTransform.DELETE, index=0, amount=1, sheet_id=1
            ),
            "Sheet1",
            None,
        ),
    ],
)
def test_adjust_codepanel_add_delete_cells(
    init_code, transformation, sheet_name, expected
):
    nb = notebook(init_code)
    assert nb.adjust_codepanel_add_delete_cells(transformation, sheet_name) == expected

import re

import pytest

from neptyne_kernel.cell_address import Address
from neptyne_kernel.cell_range import CellRange
from neptyne_kernel.formulas.boolean import FALSE, TRUE
from neptyne_kernel.spreadsheet_error import (
    NA_ERROR,
    REF_ERROR,
    SYNTAX_ERROR,
    TRACEBACK_FILE_HEADER_RE,
    VALUE_ERROR,
    SpreadsheetError,
    should_hide_errors_from_file,
)

from .kernel_simulator import ansi_escape


@pytest.mark.parametrize(
    "code, result",
    [
        ("=T.DIST(60, 1, TRUE)", 0.99469533),
        ("=T.DIST.2T(1,2)", 0.42264973081037),
        ("=T.INV.2T(0.546449, 60)", 0.606533),
        ("=T.INV.2T(T.DIST.2T(1,2), 60)", 0.807357381),
    ],
)
def test_formulas_with_dots(simulator, code, result):
    simulator.run_cell("A1", code)
    assert simulator.get("A1") == pytest.approx(result, rel=1e-3)


@pytest.mark.parametrize(
    "code, cell, result",
    [
        ("={1,2,3;4,5,6;7,8,9}", "C3", 9),
        ("={10,9,8,7}", "D1", 7),  # single row
        ("={10;9;8;7}", "A4", 7),  # single column
        ('=MAX({1.5,2.5,3.5;4.5,5.5,6.5;7.5,8.5,9.5,"hello"})', "A1", 9.5),
        ("=T.INV.2T(T.DIST.2T(MIN({1,2,3;4,5,6;7,8,9}),2), 60)", "A1", 0.807357381),
    ],
)
def test_array(simulator, code, cell, result):
    simulator.run_cell("A1", code)
    assert simulator.get(cell) == pytest.approx(result, rel=1e-3)


@pytest.mark.parametrize(
    "code",
    [
        "={1,2,{3,4}}",
        "=MAX({1,2,MIN({1,2,3;4,5,6;7,8,9})})",
    ],
)
def test_array_errors(simulator, code):
    simulator.run_cell("A1", code)
    assert isinstance(simulator.get("A1"), SpreadsheetError)


@pytest.mark.parametrize(
    "reference, result",
    [
        ("B10:D20", 1),
        ("B10", 1),
        ("(B10:D20, B15)", 2),
    ],
)
def test_AREAS(simulator, reference, result):
    simulator.run_cell("A1", f"=AREAS({reference})")
    res = simulator.get("A1")
    assert res == result


def test_COLUMN(simulator):
    simulator.run_cell("C2", "=COLUMN()")
    assert simulator.get("C2") == 3
    simulator.run_cell("C2", "=COLUMN(D6)")
    assert simulator.get("C2") == 4
    simulator.run_cell("C2", "=COLUMN(B2:D2)")
    assert simulator.get("C2") == 2
    assert simulator.get("D2") == 3
    assert simulator.get("E2") == 4


def test_ROW(simulator):
    simulator.run_cell("C2", "=ROW()")
    assert simulator.get("C2") == 2
    simulator.run_cell("C2", "=ROW(D6)")
    assert simulator.get("C2") == 6
    simulator.run_cell("C2", "=ROW(E5:D7)")
    assert simulator.get("C2") == 5
    assert simulator.get("C3") == 6
    assert simulator.get("C4") == 7


def test_INDIRECT(simulator):
    simulator.run_cell("A2", "=SQRT(4)")
    simulator.run_cell("C2", '=INDIRECT("A2")')
    assert simulator.get("C2") == 2
    simulator.run_cell("D5", "=SUM(3,2)")
    simulator.run_cell("D10", '=INDIRECT("D5")')
    assert simulator.get("D10") == 5
    simulator.run_cell("K5", '=INDIRECT("R2D2",FALSE)')
    assert simulator.get("K5") == REF_ERROR
    simulator.run_cell("K5", '=INDIRECT("R5C4",FALSE)')
    assert simulator.get("K5") == 5


def test_OFFSET(simulator):
    simulator.run_cell("A2", "=SQRT(4)")
    simulator.run_cell("C2", "=OFFSET(A1,1,0)")
    assert simulator.get("C2") == 2
    simulator.run_cell("C2", "=OFFSET(A1,-1,-1)")
    assert simulator.get("C2") == REF_ERROR
    simulator.run_cell("K5", "=SEQUENCE(4,5)")
    simulator.run_cell("D10", "=OFFSET(K5,3,2)")
    assert simulator.get("D10") == 18
    simulator.run_cell("D10", "=OFFSET(K5,0,0)")
    assert simulator.get("D10") == 1


TEST_XLOOKUP = CellRange(
    [
        [None, "A", "B", "C", "D"],
        ["Vinyl", 10, 11.5, 13.23, 15.21],
        ["Wood", 12, 13.8, 15.87, 18.25],
        ["Glass", 15, 17.25, 19.84, 22.81],
        ["Steel", 18, 20.7, 23.81, 27.28],
        ["Titanium", 23, 26.45, 30.42, 34.98],
    ]
)


def test_XLOOKUP_special(simulator):
    for idx, row in enumerate(TEST_XLOOKUP):
        for jdx, value in enumerate(row):
            if value is not None:
                simulator.run_cell(chr(ord("A") + jdx) + str(idx + 1), str(value))
    simulator.run_cell("E8", '=XLOOKUP(14,B2:E2,B3:E6,"Not found",1,1)')
    assert simulator.get("E8") == 18.25
    assert simulator.get("E9") == 22.81
    assert simulator.get("E10") == 27.28
    assert simulator.get("E11") == 34.98

    simulator.run_cell("K1", '=XLOOKUP(14,B2:D2,B3:E6,"Not found",1,1)')
    assert simulator.get("K1") == VALUE_ERROR

    simulator.run_cell("A14", '=XLOOKUP(13,B2:B6,A2:B6,"Not found",1,1)')
    assert simulator.get("A14") == "Glass"
    assert simulator.get("B14") == 15

    simulator.run_cell("K1", '=XLOOKUP(13,B2:B6,A2:B5,"Not found",1,1)')
    assert simulator.get("K1") == VALUE_ERROR


def test_TRANSPOSE_special(simulator):
    for i in range(1, 4):
        i = str(i)
        simulator.run_cell("A" + i, i)
    simulator.run_cell("K1", "=TRANSPOSE(A1:A3)")
    assert simulator.get("K1") == 1
    assert simulator.get("L1") == 2
    assert simulator.get("M1") == 3
    simulator.run_cell("V1", "=TRANSPOSE(K1:M1)")
    assert simulator.get("V1") == 1
    assert simulator.get("V2") == 2
    assert simulator.get("V3") == 3


def test_SHEET(simulator):
    simulator.run_cell("B1", "=SHEET()")
    assert simulator.get("B1") == 0


def test_SHEETS(simulator):
    simulator.get_sheets().new_sheet("CustomSheet")
    simulator.run_cell(Address.from_a1("A1", sheet=0), "Hello")
    simulator.run_cell(Address.from_a1("A1", sheet=1), "=Sheet0!A1")
    simulator.run_cell("B1", "=SHEETS()")
    assert simulator.get("B1") == 2


def test_ISREF(simulator):
    simulator.run_cell("A2", "=ISREF(A1)")
    assert simulator.get("A2")
    simulator.run_cell("A2", "=ISREF(A1:E1)")
    assert simulator.get("A2")
    simulator.run_cell("A2", "=ISREF(Sheet0!A1)")
    assert simulator.get("A2")
    simulator.run_cell("A2", '=ISREF("test")')
    assert not simulator.get("A2")
    simulator.run_cell("D1", "=ISREF(A1:C1)")
    assert simulator.get("D1")
    simulator.run_cell("A2", "=ISREF(100)")
    assert not simulator.get("A2")


def test_CELL(simulator):
    simulator.run_cell("A1", "hello")
    simulator.run_cell("B1", "=SUM(2,3)")
    simulator.run_cell("D1", '=CELL("address",B1)')
    assert simulator.get("D1") == "B1"
    simulator.run_cell("D1", '=CELL("row",B1)')
    assert simulator.get("D1") == 1
    simulator.run_cell("D1", '=CELL("col",B1)')
    assert simulator.get("D1") == 2
    simulator.run_cell("D1", '=CELL("address")')
    assert simulator.get("D1") == "D1"
    simulator.run_cell("D1", '=CELL("col")')
    assert simulator.get("D1") == 4
    simulator.run_cell("D1", '=CELL("row")')
    assert simulator.get("D1") == 1
    simulator.run_cell("D1", '=CELL("type", B1)')
    assert simulator.get("D1") == "v"
    simulator.run_cell("D1", '=CELL("type")')
    assert simulator.get("D1") == "b"
    simulator.run_cell("D1", '=CELL("type", A1)')
    assert simulator.get("D1") == "l"
    simulator.run_cell("D1", '=CELL("contents")')
    assert simulator.get("D1") == 0


@pytest.mark.parametrize(
    "code, idx, tb_idx, code_line_idx",
    [
        ("1 /MIN (Sheet1!A1:D5)", 2, -2, 0),
        ("A1:A3[5] = 100", 2, -2, 0),
        ("1 /MIN (Sheet1!A1:K6)", 2, -2, 0),
        ("123456 +MIN (A4:D5,A1::D9)", 0, 1, 0),
        ("A6+MIN (A4:D5,A1::D9)", 0, 1, 0),
        ("A1+A6:Z10+MIN (A4:D5,A1::D9)", 0, 1, 0),
        ("1234 +A1::A8", 0, 1, 0),
        ("1 /MIN (A1:E1000)", 2, -2, 0),
        ("1 /Sheet1!A1", 2, -2, 0),
        ("1 /MIN (A1:K6)", 2, -2, 0),
        ("1 /MIN (New_sheet!A1:D5)", 2, -2, 0),
        # Indentation error
        ("for i in range (4 );print (1 /A1)", 0, 1, 0),
        # Multiple frames
        ("def do_it():\n    return (1 +Sheet1!A1+Sheet1!A1)/0\ndo_it()", 3, 2, 1),
    ],
)
def test_uncompile_dash_traceback(simulator, code, idx, tb_idx, code_line_idx):
    def s1(a1):
        return Address.from_a1(a1, sheet=1)

    simulator.run_cell("A1", "=0")
    simulator.run_cell("K6", "=777")
    simulator.repl_command("import neptyne as nt")
    simulator.repl_command("nt.sheets.new_sheet('Sheet1')")
    simulator.run_cell(s1("A1"), "=0")
    simulator.run_cell(s1("K6"), "=555")

    # Can't use simulator.repl_command because it checks for errors itself:
    simulator.run_cell("06", code)
    errors = [
        reply["content"]
        for reply in simulator.kc.iopub_channel.get_msgs()
        if reply["msg_type"] == "error"
    ]
    assert errors
    error_text = ansi_escape(errors[0]["traceback"][idx].split("\n")[tb_idx]).lstrip()
    code_in_error = code.split("\n")[code_line_idx].lstrip()
    assert error_text.endswith(code_in_error)


@pytest.mark.parametrize(
    "formula, result",
    [
        ("LET(x, 5, SUM(x, 1))", 6),
        # Nested LET
        ("LET(x,1,y,LET(z,2,z*3),x+y)", 7),
        ("LET(x,2,q, LET(y,3,w,LET(z,4,SUM(z,10)),MIN(y,w)),MAX(x,q))", 3),
        ("LET(x,SQRT(LET(q, 10000, q/100)),y,MIN(x,20,5,30),POWER(x,y))", 100000),
        # Arguments depend on previous
        ("LET(x,2,y,POWER(3,x),MAX(x,y))", 9),
        # Combo
        ("LET(x,1,y,x+5,z,LET(a,x+y,b,2,a*b),x+y+z)", 21),
    ],
)
def test_LET(simulator, formula, result):
    simulator.run_cell("A1", f"={formula}")
    assert simulator.get("A1") == result


@pytest.mark.parametrize(
    "expression, line_no",
    [
        ("Q1:Q2[25] = 3", 0),
        ("A6+MIN (A4:D5,A1::D9)", 0),
        ("G1+A6:Z10+MIN (A4:D5,A1::D9)", 0),
        ("1234 +A1::A8", 0),
        ("A1.set_text_style('bbb')", 2),
        ("A1.set_background_color('a','b','c')", 2),
        ("A1.set_text_align('align')", 2),
    ],
)
def test_spreadsheet_traceback_stack_cut_off(simulator, expression, line_no):
    simulator.run_cell("A1", f"={expression}")
    result = simulator.get("A1").traceback

    m = re.search(TRACEBACK_FILE_HEADER_RE, result[line_no])
    assert not (m and should_hide_errors_from_file(m.group("path")))


def test_traceback_stack_cut_off_for_code_panel_functions(simulator):
    code = """def badfn():\n    c = 1 / 0\n    return 2"""
    simulator.run_cell("00", code)
    simulator.run_cell("A1", "=badfn()")

    result = simulator.get("A1").traceback

    print(result)
    assert len(result) == 4 and "c = 1 / 0" in ansi_escape(result[2])


@pytest.mark.parametrize(
    "code, idx, tb_idx, code_line_idx",
    [
        # Strip beginning newlines
        ("\n\n\n\n\nMIN (A1:A2)/0\n\n\n\n\ndef fn(): pass", 2, 1, 5),
        # Skip 'flush_side_effects' traceback frame
        (
            "import neptyne as nt\n\n\n\n\n\n\n\n\n@nt.on_value_change(A1:A2)\ndef green_strings(cell):\n    1 /0\n    if isinstance(cell, str):\n        cell.set_background_color(0,255,0)\n    else:\n        cell.set_background_color(255,255,255)",
            2,
            3,
            11,
        ),
    ],
)
def test_traceback_for_non_blacked_code(simulator, code, idx, tb_idx, code_line_idx):
    simulator.run_cell("00", code)

    errors = [
        reply["content"]
        for reply in simulator.kc.iopub_channel.get_msgs()
        if reply["msg_type"] == "error"
    ]
    assert errors and ansi_escape(
        errors[0]["traceback"][idx].split("\n")[tb_idx]
    ).strip().endswith(code.split("\n")[code_line_idx].strip())


@pytest.mark.parametrize(
    "value, result",
    [
        ("", TRUE),
        ("0", FALSE),
        ("1", FALSE),
        ("=1/0", FALSE),
        ("hello", FALSE),
    ],
)
def test_ISBLANK_ref(simulator, value, result):
    simulator.run_cell("A1", value)
    simulator.run_cell("A2", "=ISBLANK(A1)")
    assert simulator.get("A2") == result


@pytest.mark.parametrize(
    "formula, expected",
    [
        ('IFERROR(1/0,"div0")', "div0"),
        ('IFERROR(Scatter(), IFERROR(1/0, "error"))', "error"),
        ('IFERROR(LET(x,3,x/0),"error")', "error"),
        ('LET(x,3,IFERROR(x/0,"error"))', "error"),
        ('IFERROR(len(""))', NA_ERROR),
        ("IFERROR()", SYNTAX_ERROR),
        ("IFERROR(1,2,3,4,5)", NA_ERROR),
    ],
)
def test_IFERROR(simulator, formula, expected):
    simulator.run_cell("A1", f"={formula}")
    result = simulator.get("A1")
    if isinstance(expected, SpreadsheetError):
        assert result.ename == expected.ename
    else:
        assert result == expected


@pytest.mark.parametrize(
    "formula, result",
    [
        ('IFNA(a[4],"na error")', "na error"),
        ('IFNA(a[4],IFNA(a[5],"na error"))', "na error"),
    ],
)
def test_IFNA(simulator, formula, result):
    simulator.repl_command("a=[1,2,3]")
    simulator.run_cell("A1", f"={formula}")
    assert simulator.get("A1") == result


def test_now_and_empty(simulator):
    simulator.run_cell("A1", "=NOW()")
    simulator.run_cell("A2", "=NOW() + B1")
    assert simulator.get("A2") >= simulator.get("A1")

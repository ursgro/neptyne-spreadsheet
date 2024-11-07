import pytest
from jupyter_client.utils import run_sync

from neptyne_kernel.cell_address import Address
from neptyne_kernel.neptyne_protocol import (
    Dimension,
    MessageTypes,
    RenameSheetContent,
    SheetAttribute,
    SheetTransform,
)
from neptyne_kernel.spreadsheet_error import SpreadsheetError
from server.models import AccessLevel
from server.msg_handler_meta import ClientMessageContext


def msg_with_context(msg):
    # noinspection PyTypeChecker
    return ClientMessageContext(msg, None, None, AccessLevel.EDIT)


def test_rename_sheet(simulator):
    simulator.repl_command("import neptyne as nt\nSheet0!A1=1")
    assert simulator.get("A1") == 1
    simulator.run_cell("A2", "=Sheet0!A1")
    assert simulator.get("A2") == 1
    msg = simulator.default_msg(
        MessageTypes.RENAME_SHEET.value,
        content=RenameSheetContent(name="newSheet", sheet_id=0).to_dict(),
    )
    run_sync(simulator.tyne_proxy.handle_client_message)(
        msg_with_context(msg),
    )
    assert simulator.get("newSheet!A1") == 1

    # We can't test the actual newSheet contents because global_dash() is not the simulator dash
    # so we test for existence instead
    simulator.repl_command("B1=str(newSheet)")
    assert simulator.get("B1") == "NeptyneSheet(0)"

    simulator.repl_command("B2=[x.name for x in nt.sheets]")
    assert simulator.get("B2") == "newSheet"

    with pytest.raises(RuntimeError):
        simulator.repl_command("B3=str(Sheet0)")

    assert simulator.get_cell("A2").raw_code == "=newSheet!A1"

    simulator.repl_command("newSheet.name='Sheet0'")
    simulator.repl_command("B4=str(Sheet0)")
    assert simulator.get("B4") == "NeptyneSheet(0)"
    simulator.restart()
    assert simulator.get_cell("A2").raw_code == "=Sheet0!A1"


def test_create_delete_sheet(simulator):
    simulator.repl_command("import neptyne as nt")

    create_msg = simulator.default_msg(
        MessageTypes.CREATE_SHEET.value,
        content={},
    )
    run_sync(simulator.tyne_proxy.handle_client_message)(
        msg_with_context(create_msg),
    )
    simulator.repl_command("Sheet1!A1=1")
    assert simulator.get("Sheet1!A1") == 1

    simulator.run_cell("Q1", "='hello' in nt.sheets")
    assert not simulator.get("Q1")

    simulator.repl_command("B1=nt.sheets['Sheet1'].name")
    assert simulator.get("B1") == "Sheet1"

    simulator.repl_command("B2=str(Sheet1)")
    assert simulator.get("B2") == "NeptyneSheet(1)"

    delete_msg = simulator.default_msg(
        MessageTypes.DELETE_SHEET.value,
        content={"sheetId": 1},
    )
    run_sync(simulator.tyne_proxy.handle_client_message)(
        msg_with_context(delete_msg),
    )
    with pytest.raises(RuntimeError):
        simulator.run_cell("03", "B3=str(Sheet1)")
        simulator.wait_for_kernel()

    simulator.repl_command("B4=str(nt.sheets['Sheet0'])")
    assert simulator.get("B4") == "NeptyneSheet(0)"

    simulator.repl_command("nt.sheets.new_sheet('Sheet2')\nB5=len(nt.sheets)")
    assert simulator.get("B5") == 2

    simulator.repl_command("nt.sheets.delete_sheet('Sheet2')\nB6=len(nt.sheets)")
    assert simulator.get("B6") == 1

    simulator.repl_command("nt.sheets.new_sheet('Transport')")
    simulator.repl_command(
        "nt.sheets.delete_sheet('Transport')\nnt.sheets.new_sheet('Transport')"
    )
    simulator.repl_command("del nt.sheets['Transport']")
    simulator.repl_command("nt.sheets.new_sheet('New')\nNew!A1='hello'")


def test_create_sheet_from_kernel(simulator):
    assert len(simulator.get_sheets()) == 1
    simulator.repl_command("import neptyne as nt")
    simulator.run_cell("A1", '=nt.sheets.new_sheet("new sheet").sheet_id')
    assert len(simulator.get_sheets()) == 2
    assert "new sheet" in simulator.get_sheets()
    assert simulator.get("A1") == 1  # the sheet id


def test_delete_sheet_cleans_up_kernel(simulator):
    simulator.repl_command("import neptyne as nt")
    simulator.repl_command('nt.sheets.new_sheet("NewSheet")')
    assert len(simulator.get_sheets()) == 2
    assert set(sheet.sheet_id for sheet in simulator.get_sheets()) == {0, 1}
    simulator.run_cell(Address.from_a1("A1", sheet=1), "=99")
    simulator.run_cell("A1", "=N_[0,0,1]")
    assert simulator.get("A1") == 99
    simulator.repl_command("nt.sheets.delete_sheet(1)")
    simulator.run_cell("A1", "=N_[0,0,1]")
    assert simulator.get("A1") is None
    assert len(simulator.get_sheets()) == 1


def test_delete_sheet_cleans_up_graph(simulator):
    simulator.repl_command("import neptyne as nt")
    simulator.repl_command('nt.sheets.new_sheet("NewSheet")')
    simulator.run_cell("A1", "=1")
    simulator.run_cell("A2", "=2")
    simulator.run_cell(Address.from_a1("A1", sheet=1), "=SUM(Sheet0!A1:A)")
    assert simulator.get("NewSheet!A1") == 3
    simulator.repl_command("N_.clear_sheet(1)")
    simulator.run_cell("A3", "=3")
    simulator.run_cell("B1", "=SUM(A1:A)")
    assert simulator.get("B1") == 6


def test_sheet_slicing(simulator):
    simulator.repl_command("import neptyne as nt")
    simulator.repl_command('nt.sheets.new_sheet("NewSheet")')
    simulator.run_cell(
        Address.from_a1("A1", sheet=1),
        "=[[j+i for j in 'ABCDEF'] for i in '1234567890']",
    )

    simulator.run_cell(Address.from_a1("G1", sheet=1), "G1")
    simulator.run_cell(Address.from_a1("A11", sheet=1), "A11")
    simulator.run_cell(Address.from_a1("A0", sheet=1), "=NewSheet[-1,-1]")
    assert simulator.get(Address.from_a1("A0", sheet=1)) is None
    simulator.run_cell(Address.from_a1("A0", sheet=1), "=NewSheet[-1,0]")
    assert simulator.get(Address.from_a1("A0", sheet=1)) == "A11"
    simulator.run_cell(Address.from_a1("A0", sheet=1), "=NewSheet[0,-1]")
    assert simulator.get(Address.from_a1("A0", sheet=1)) == "G1"

    simulator.run_cell(Address.from_a1("H1", sheet=1), "=NewSheet[1,1]")
    assert simulator.get(Address.from_a1("H1", sheet=1)) == "B2"

    simulator.run_cell(Address.from_a1("I1", sheet=1), "=NewSheet[2:4,2:4]")
    assert simulator.get(Address.from_a1("I1", sheet=1)) == "C3"
    assert simulator.get(Address.from_a1("J1", sheet=1)) == "D3"
    assert simulator.get(Address.from_a1("I2", sheet=1)) == "C4"
    assert simulator.get(Address.from_a1("J2", sheet=1)) == "D4"

    simulator.run_cell(Address.from_a1("K1", sheet=1), "=NewSheet[5:7,2:4]")
    assert simulator.get(Address.from_a1("K1", sheet=1)) == "C6"
    assert simulator.get(Address.from_a1("L1", sheet=1)) == "D6"
    assert simulator.get(Address.from_a1("K2", sheet=1)) == "C7"
    assert simulator.get(Address.from_a1("L2", sheet=1)) == "D7"

    simulator.run_cell(Address.from_a1("M1", sheet=1), "=NewSheet[2:3][2]")
    assert simulator.get(Address.from_a1("M1", sheet=1)) == "C3"

    # Empty sheet
    simulator.repl_command("nt.sheets.new_sheet('Sheet2')")
    simulator.run_cell("A1", "=Sheet2[0, 0]")
    assert simulator.get("A1") is None
    simulator.run_cell("A1", "=Sheet2[1, 1]")
    assert simulator.get("A1") is None
    simulator.run_cell("A1", "=Sheet2[-1, -1]")
    assert simulator.get("A1") is None

    # One-dimensional
    simulator.repl_command("Sheet2!A1='a1'")

    simulator.run_cell("A2", "=Sheet2[-1,-1]")
    assert simulator.get("A2") == "a1"
    simulator.run_cell("A2", "=Sheet2[-1, 0]")
    assert simulator.get("A2") == "a1"
    simulator.run_cell("A2", "=Sheet2[0,-1]")
    assert simulator.get("A2") == "a1"

    simulator.run_cell("A3", "=Sheet2[1, -1]")
    assert simulator.get("A3") is None
    simulator.run_cell("A3", "=Sheet2[-1, 1]")
    assert simulator.get("A3") is None

    simulator.run_cell("A3", "=Sheet2[0, 1]")
    assert simulator.get("A3") is None
    simulator.run_cell("A3", "=Sheet2[1, 0]")
    assert simulator.get("A3") is None


def test_multi_sheet_formulas(simulator):
    def s1(a1):
        return Address.from_a1(a1, sheet=1)

    simulator.run_cell("A1", "1")
    simulator.repl_command("import neptyne as nt")
    simulator.repl_command("Q1 = nt.sheets.new_sheet().name")
    assert simulator.get("Q1") == "Sheet1"

    simulator.run_cell(s1("A1"), "=Sheet0!A1")
    assert simulator.get(s1("A1")) == 1
    simulator.run_cell("A1", "=range(3)")
    simulator.run_cell(s1("A1"), "=range(3,6)")
    simulator.run_cell("B1", "=SUM(A1:A3)")
    simulator.run_cell(s1("B1"), "=SUM(A1:A3)")
    assert simulator.get("B1") == 3
    assert simulator.get(s1("B1")) == 12
    simulator.run_cell("C1", "=SUM(Sheet0!A1:A3)")
    simulator.run_cell(s1("C1"), "=SUM(Sheet0!A1:A3)")
    assert simulator.get("C1") == 3
    assert simulator.get(s1("C1")) == 3


def test_delete_sheet(simulator):
    simulator.repl_command("import neptyne as nt")
    simulator.repl_command("nt.sheets.new_sheet('NewSheet')")

    simulator.run_cell("A1", "1")
    simulator.run_cell("A1", "=Sheet0!A1", sheet_id=1)
    assert simulator.get("NewSheet!A1") == 1

    simulator.run_cell("A2", "2", sheet_id=1)
    simulator.run_cell("A2", "=NewSheet!A2")
    assert simulator.get("NewSheet!A2") == 2
    assert simulator.get("A2") == 2

    simulator.repl_command("nt.sheets.delete_sheet('NewSheet')")

    result = simulator.get("A2")
    print(result)
    assert isinstance(result, SpreadsheetError)

    simulator.restart()
    assert not simulator.get_cell("A1").feeds_into


def test_row_col_api(simulator):
    simulator.run_cell("A2", "1")
    simulator.repl_command("cols = Sheet0.cols[0:2]")
    simulator.repl_command("cols[1,0]")
    assert simulator.last_repl_output() == "1"
    with pytest.raises(RuntimeError):
        simulator.repl_command("cols.set_height(100)")
    simulator.repl_command("cols.set_width(200)")
    assert simulator.get_sheet_attribute(0, SheetAttribute.COLS_SIZES.value) == {
        "0": 200,
        "1": 200,
    }

    simulator.repl_command("cols.freeze()")
    assert simulator.get_sheet_attribute(0, "colsFrozenCount") == 2
    simulator.repl_command("cols.unfreeze()")
    assert simulator.get_sheet_attribute(0, "colsFrozenCount") == 0

    simulator.repl_command("rows = Sheet0.rows[1:5]")
    with pytest.raises(RuntimeError):
        simulator.repl_command("rows.freeze()")
    with pytest.raises(RuntimeError):
        simulator.repl_command("rows.unfreeze()")

    simulator.repl_command("cols.hide()")
    assert simulator.get_sheet_attribute(0, "colsHiddenHeaders") == [0, 1]

    simulator.repl_command("cols2 = Sheet0.cols[0:5]")
    simulator.repl_command("cols2.unhide()")
    assert simulator.get_sheet_attribute(0, "colsHiddenHeaders") == []


def test_row_col_api_with_insert_delete(simulator):
    simulator.repl_command("cols = Sheet0.cols[0:2]")
    simulator.repl_command("cols.set_width(200)")
    simulator.repl_command("cols.freeze()")
    simulator.repl_command("cols.hide()")

    assert simulator.get_sheet_attribute(0, SheetAttribute.COLS_SIZES.value) == {
        "0": 200,
        "1": 200,
    }
    assert simulator.get_sheet_attribute(0, "colsFrozenCount") == 2
    assert simulator.get_sheet_attribute(0, "colsHiddenHeaders") == [0, 1]

    simulator.run_add_delete(SheetTransform.INSERT_BEFORE, Dimension.COL, 0)

    assert simulator.get_sheet_attribute(0, SheetAttribute.COLS_SIZES.value) == {
        "0": 200,
        "1": 200,
        "2": 200,
    }
    assert simulator.get_sheet_attribute(0, "colsFrozenCount") == 3
    assert simulator.get_sheet_attribute(0, "colsHiddenHeaders") == [1, 2]

    simulator.run_add_delete(SheetTransform.DELETE, Dimension.COL, 0)

    assert simulator.get_sheet_attribute(0, SheetAttribute.COLS_SIZES.value) == {
        "0": 200,
        "1": 200,
    }
    assert simulator.get_sheet_attribute(0, "colsFrozenCount") == 2
    assert simulator.get_sheet_attribute(0, "colsHiddenHeaders") == [0, 1]


def test_col_row_resizing(simulator):
    simulator.repl_command("Sheet0.cols[0].set_width(220)")
    assert simulator.get_sheets()[0].cols[0].get_width() == 220

    with pytest.raises(RuntimeError):
        simulator.repl_command("Sheet0.cols[1].set_height(220)")

    simulator.repl_command("Sheet0.rows[2].set_height(50)")
    assert simulator.get_sheets()[0].rows[2].get_height() == 50

    simulator.repl_command("A:A.width = 320")
    assert simulator.get_sheets()[0].cols[0].get_width() == 320

    simulator.repl_command("2:3.set_height(54)")
    assert simulator.get_sheets()[0].rows[1].get_height() == 54
    assert simulator.get_sheets()[0].rows[2].height == 54


def test_sheet_context(simulator):
    simulator.repl_command("import neptyne as nt")
    simulator.repl_command("nt.sheets.new_sheet('NewSheet')")
    simulator.repl_command("NewSheet!A1 = 1")
    assert simulator.get("NewSheet!A1") == 1
    assert simulator.get("A1") is None
    simulator.repl_command("""
with nt.sheets['NewSheet']:
    A1 += 1
""")
    assert simulator.get("NewSheet!A1") == 2
    assert simulator.get("A1") is None

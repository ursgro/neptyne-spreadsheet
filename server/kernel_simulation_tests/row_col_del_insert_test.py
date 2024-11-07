import pytest

from neptyne_kernel.cell_address import Address
from neptyne_kernel.expression_compiler import DEFAULT_GRID_SIZE, Dimension
from neptyne_kernel.neptyne_protocol import (
    DragRowColumnContent,
    SheetAttribute,
    SheetTransform,
)
from neptyne_kernel.test_utils import a1


def test_cell_range_shift_2d(simulator):
    simulator.run_cell("A1", "=[[ch1 + ch2 for ch1 in 'ABCDEF'] for ch2 in 'ABCDEF']")
    simulator.repl_command("r = B2:D10")
    simulator.repl_command("r.insert_row(1, ['Q', 'R', 'S'])")
    simulator.run_cell("Q10", "= r[2][0] + r[1][0] + r[0][0]")
    assert simulator.get("Q10") == "BCQBB"
    simulator.run_cell("Q10", "= r[0,0] + r[1, 0] + r[2, 0]")
    assert simulator.get("Q10") == "BBQBC"
    simulator.repl_command("B2:D10.append_row(['X', 'Y', 'Z'])")
    simulator.run_cell("Q11", "='-'.join(C6:C8)")
    assert simulator.get("Q11") == "CE-CF-Y"
    simulator.repl_command("A1:F5.set_background_color(10, 10, 10)")
    simulator.repl_command("A1:F5.delete_row(1)")
    simulator.restart()
    simulator.run_cell("Q12", "='-'.join(A2:C2)")
    assert simulator.get("Q12") == "AC-Q-R"
    simulator.repl_command("r = B2:D10")
    simulator.repl_command("r.clear()")
    assert simulator.get("B2") is None


def test_append_row(simulator):
    simulator.run_cell("A1", "Heading 1")
    simulator.run_cell("B1", "Heading 2")
    simulator.repl_command("A1:B10.append_row([10, 20])")
    assert simulator.get("A2") == 10
    simulator.repl_command("A1:B.append_row(['Value 2', 'Value 3'])")
    assert simulator.get("A3") == "Value 2"
    with pytest.raises(RuntimeError) as e:
        simulator.repl_command("A1:B3.append_row(['Value 4', 'Value 5'])")
    assert "empty" in str(e.value).lower()
    simulator.run_cell("B4", "Hello")
    simulator.repl_command("A1:B.append_row(['Value 6', 'Value 7'])")
    assert simulator.get("A5") == "Value 6"

    simulator.run_cell("D1", "Single")
    simulator.repl_command("D1:D10.append_row('first')")
    assert simulator.get("D2") == "first"
    simulator.repl_command("D1:D.append_row('second')")
    assert simulator.get("D3") == "second"
    with pytest.raises(RuntimeError) as e:
        simulator.repl_command("D1:D3.append_row('third')")
    assert "empty" in str(e.value).lower()


def test_cell_range_shift_1d(simulator):
    simulator.run_cell("A1", "=range(5)")
    simulator.repl_command("A1:A5.insert_row(1, 10)")
    assert simulator.get("A2") == 10
    assert simulator.get("A3") == 1

    simulator.repl_command("A1:A6.delete_row(1)")
    assert simulator.get("A3") == 2

    simulator.repl_command("A2:A10.append_row(99)")
    assert simulator.get("A5") == 99

    simulator.repl_command("A1:A4.clear()")
    assert simulator.get("A3") is None


def test_insert_delete_api(simulator):
    simulator.repl_command("A1:B10.append_row([10, 20])")
    assert simulator.get("A1") == 10
    assert simulator.get("B1") == 20

    simulator.repl_command("A1:B10.insert_row(0, amount=3)")
    assert simulator.get("A4") == 10
    assert simulator.get("B4") == 20

    simulator.repl_command("A1:B10.append_row([10, 20])")
    assert simulator.get("A4") == 10
    assert simulator.get("B5") == 20
    assert simulator.get("A5") == 10
    assert simulator.get("B5") == 20

    with pytest.raises(RuntimeError):
        simulator.repl_command("A1:B10.delete_row(0, 11)")


def test_insert_delete_api_formula_updates(simulator):
    simulator.run_cell("A1", "=B1")
    simulator.run_cell("B1", "2")
    simulator.run_cell("C2", "=SUM(A1:B1)")
    simulator.run_cell("D2", "=SUM(A2:B10)")
    assert simulator.get("C2") == 4
    assert simulator.get("D2") == 0

    simulator.repl_command("A1:B3.insert_row(0)")

    assert simulator.get("A2") == 2
    assert simulator.get("B2") == 2
    assert simulator.get("C2") == 0
    assert simulator.get("D2") == 4

    assert simulator.get_cell("C2").raw_code == "=SUM(A1:B1)"
    assert simulator.get_cell("D2").raw_code == "=SUM(A2:B10)"
    assert simulator.get_cell("A1").raw_code == ""
    assert simulator.get_cell("A2").raw_code == "=B2"


def test_insert_api_messy_size(simulator):
    simulator.run_cell("A1", "first")
    simulator.repl_command("A1:B10.insert_row(0, ['test', [100, 200], [400, 'hi']])")
    assert not simulator.get("B1")
    assert simulator.get("A1") == "test"
    assert simulator.get("B2") == 200
    assert simulator.get("A3") == 400
    assert simulator.get("A4") == "first"

    simulator.repl_command("A1:B10.clear()")
    assert not simulator.get("A1")

    simulator.run_cell("A1", "first")
    simulator.repl_command("A1:C10.append_column([[100, 200], [400, 'hi']])")
    assert simulator.get("B1") == 100
    assert simulator.get("C2") == "hi"

    with pytest.raises(RuntimeError):
        simulator.repl_command("A1:B.insert_row(0,[1,[2,3,4]])")

    with pytest.raises(RuntimeError):
        simulator.repl_command("A1:B.insert_row(0,[1,2,3])")

    simulator.repl_command("A1:B.insert_column(0,[1,2,3])")
    assert simulator.get("A2") == 2


def test_single_row_col_insert_delete(simulator):
    simulator.run_cell("A1", "first")
    simulator.repl_command("A1:C10.insert_row(0, [1,2,3])")
    assert simulator.get("A1") == 1
    assert simulator.get("B1") == 2
    assert simulator.get("A2") == "first"

    simulator.repl_command("A1:B10.clear()")
    simulator.run_cell("A1", "first")
    simulator.repl_command("A1:C10.insert_column(0, [1,2,3])")
    assert simulator.get("A1") == 1
    assert simulator.get("A2") == 2
    assert simulator.get("B1") == "first"


def test_cell_refs(simulator):
    simulator.run_cell("A1", "first")
    simulator.run_cell("01", "print(A1)")
    simulator.run_cell("02", "print(A1 + '!')")
    assert simulator.get("A1") == "first"

    simulator.run_add_delete(SheetTransform.INSERT_BEFORE, Dimension.ROW, 0)
    assert simulator.get("A2") == "first"
    simulator.run_cell("A1", "second")
    simulator.run_add_delete(SheetTransform.INSERT_BEFORE, Dimension.ROW, 0)
    assert simulator.get("A2") == "second"
    simulator.run_cell("A1", "third")
    simulator.run_cell("B1", "='-'.join(A1:A3)")
    assert simulator.get("B1") == "third-second-first"


def test_add_row_above_no_cell_references(simulator):
    # Add row before 1 (before 'A2')
    simulator.run_cell("A1", "=1")
    simulator.run_cell("A2", "=2")
    simulator.run_add_delete(SheetTransform.INSERT_BEFORE, Dimension.ROW, 1)
    assert simulator.get("A1") == 1
    assert not simulator.get("A2")
    assert simulator.get("A3") == 2

    assert simulator.get_sheet_size(0) == (
        DEFAULT_GRID_SIZE[0],
        DEFAULT_GRID_SIZE[1] + 1,
    )


def test_add_col_right_no_cell_references(simulator):
    # Add column after A
    simulator.run_cell("A1", "=1")
    simulator.run_cell("A2", "=2")
    simulator.run_cell("B1", "=3")
    simulator.run_cell("B2", "=4")
    simulator.run_add_delete(SheetTransform.INSERT_BEFORE, Dimension.COL, 1)
    assert simulator.get("A1") == 1
    assert simulator.get("A2") == 2
    assert not simulator.get("B2")
    assert not simulator.get("B1")
    assert simulator.get("C1") == 3
    assert simulator.get("C2") == 4

    assert simulator.get_sheet_size(0) == (
        DEFAULT_GRID_SIZE[0] + 1,
        DEFAULT_GRID_SIZE[1],
    )


def test_delete_row_no_cell_references(simulator):
    simulator.run_cell("A1", "=1")
    simulator.run_cell("A2", "=2")
    simulator.run_cell("A3", "=3")
    simulator.run_cell("A4", "=4")
    simulator.run_cell("B1", "=5")
    simulator.run_cell("B2", "=6")
    simulator.run_cell("B4", "=7")
    simulator.run_add_delete(SheetTransform.DELETE, Dimension.ROW, 1)
    assert simulator.get("A1") == 1
    assert simulator.get("B1") == 5
    assert simulator.get("A2") == 3
    assert simulator.get("A3") == 4
    assert simulator.get("B3") == 7
    assert not simulator.get("A4")
    assert not simulator.get("B4")

    assert simulator.get_sheet_size(0) == (
        DEFAULT_GRID_SIZE[0],
        DEFAULT_GRID_SIZE[1] - 1,
    )


def test_delete_row_with_reference(simulator):
    simulator.run_cell("A1", "1")
    simulator.run_cell("A2", "2")
    simulator.run_cell("A3", "3")
    simulator.run_cell("A4", "4")
    simulator.run_cell("B1", "=SUM(A1:A4)")
    assert simulator.get("B1") == 10

    simulator.run_cell("C1", "=A3")
    simulator.run_cell("D1", "A3")
    simulator.restart()
    assert simulator.get_cell("D1").raw_code == "A3"

    simulator.run_add_delete(SheetTransform.DELETE, Dimension.ROW, 1)
    assert simulator.get("A1") == 1
    assert simulator.get("A2") == 3
    assert simulator.get("A3") == 4
    assert not simulator.get("A4")
    assert simulator.get("B1") == 8
    simulator.restart()
    assert simulator.get_cell("C1").raw_code == "=A2"
    assert simulator.get_cell("D1").raw_code == "A3"

    # Check validity from another sum
    simulator.run_cell("C1", "=SUM(A1:B3)")
    assert simulator.get("C1") == 16

    # Perform a second delete
    simulator.run_add_delete(SheetTransform.DELETE, Dimension.ROW, 1)
    assert simulator.get("A1") == 1
    assert simulator.get("A2") == 4
    assert not simulator.get("A3")
    assert simulator.get("B1") == 5
    assert simulator.get("C1") == 10

    # Perform a third delete; This one now deletes the bottom row (which triggers some special cases)
    simulator.run_add_delete(SheetTransform.DELETE, Dimension.ROW, 1)
    assert simulator.get("A1") == 1
    assert not simulator.get("A2")
    assert simulator.get("B1") == 1
    assert simulator.get("C1") == 2


def test_insert_column_with_references(simulator):
    simulator.run_cell("A1", "=1")
    simulator.run_cell("B1", "=2")
    simulator.run_cell("C1", "=3")
    simulator.run_cell("D1", "=4")
    simulator.run_cell("A2", "=SUM(A1:D1)")
    assert simulator.get("A2") == 10
    simulator.run_add_delete(SheetTransform.INSERT_BEFORE, Dimension.COL, 1)

    assert simulator.get("A1") == 1
    assert not simulator.get("B1")
    assert simulator.get("C1") == 2
    assert simulator.get("D1") == 3
    assert simulator.get("E1") == 4
    assert simulator.get("A2") == 10


def test_delete_row_with_multi_sheet(simulator):
    simulator.repl_command("import neptyne as nt")
    simulator.repl_command("nt.sheets.new_sheet('Sheet1')")
    simulator.run_cell("A1", "=1")
    simulator.run_cell("A2", "=2")
    simulator.run_cell("A3", "=3")
    simulator.run_cell("A4", "=4")
    simulator.run_cell("B1", "=SUM(A1:A3)")
    simulator.run_cell("C1", "=SUM(Sheet1!A1:A3)")
    simulator.run_cell(Address.from_a1("B1", sheet=1), "=SUM(A1:A3)")
    simulator.run_cell(Address.from_a1("C1", sheet=1), "=SUM(Sheet0!A1:A3)")
    simulator.run_cell(Address.from_a1("B2", sheet=1), "='leave me alone!'")
    assert simulator.get("B1") == 6
    assert simulator.get("C1") == 0
    assert simulator.get(Address.from_a1("B1", sheet=1)) == 0
    simulator.run_add_delete(SheetTransform.DELETE, Dimension.ROW, 1)
    assert simulator.get("B1") == 4
    assert simulator.get("C1") == 0
    assert simulator.get(Address.from_a1("B1", sheet=1)) == 0
    assert simulator.get(Address.from_a1("C1", sheet=1)) == 4
    assert simulator.get(Address.from_a1("B2", sheet=1)) == "leave me alone!"
    # Actually test that the kernel's dash has the right value
    simulator.run_cell(Address.from_a1("C2", sheet=1), "=B2")
    assert simulator.get(Address.from_a1("C2", sheet=1)) == "leave me alone!"


def test_restore_graph_for_empty_cell_after_restart(simulator):
    simulator.run_cell("B2", "=range(2)")
    simulator.run_cell("D3", "=B3")
    simulator.run_add_delete(SheetTransform.DELETE, Dimension.ROW, 1)

    assert not simulator.get_cell("B3").feeds_into
    assert simulator.get_cell("B2").feeds_into == {a1("D2")}
    simulator.restart()
    assert simulator.get_cell("B2").feeds_into == {a1("D2")}


def test_delete_row_with_spillover(simulator):
    # 3 cases. Delete before, on or after the range formula
    simulator.run_cell("A1", "=range(4)")
    simulator.run_cell("B2", "=range(4)")
    simulator.run_cell("C3", "=range(4)")
    simulator.run_cell("D2", "=SUM(A1:C4)")
    simulator.run_cell("D3", "=SUM(A1:C4)")
    simulator.run_cell("D4", "=SUM(A1:C4)")
    simulator.run_add_delete(SheetTransform.DELETE, Dimension.ROW, 1)

    # Value within range deleted. Don't re-execute range.
    assert simulator.get("A1") == 0
    assert simulator.get("A2") == 2
    assert simulator.get("A3") == 3
    assert not simulator.get("A4")

    # Range formula is deleted, so delete all spread values as well.
    assert not simulator.get("B2")
    assert not simulator.get("B3")
    assert not simulator.get("B4")
    assert not simulator.get("B5")

    # Shift the range
    assert simulator.get("C2") == 0
    assert simulator.get("C3") == 1
    assert simulator.get("C4") == 2
    assert simulator.get("C5") == 3
    assert not simulator.get("C6")

    assert simulator.get("D2") == 6
    assert simulator.get("D3") == 6
    assert not simulator.get("D4")

    # Validate the graph state very precisely.
    simulator.restart()
    assert simulator.get_cell("A1").depends_on == set()
    assert simulator.get_cell("A1").calculated_by is None
    assert simulator.get_cell("A1").feeds_into == {
        a1("A2"),
        a1("A3"),
        a1("D2"),
        a1("D3"),
    }

    assert simulator.get_cell("A2").depends_on == set()
    assert simulator.get_cell("A2").feeds_into == {a1("D2"), a1("D3")}
    assert simulator.get_cell("A2").calculated_by == a1("A1")

    assert simulator.get_cell("A3").depends_on == set()
    assert simulator.get_cell("A3").feeds_into == {a1("D2"), a1("D3")}
    assert simulator.get_cell("A3").calculated_by == a1("A1")

    assert simulator.get_cell("B2").depends_on == set()
    assert simulator.get_cell("B2").feeds_into == {a1("D2"), a1("D3")}
    assert simulator.get_cell("B2").calculated_by is None

    assert simulator.get_cell("B3").depends_on == set()
    assert simulator.get_cell("B3").feeds_into == {a1("D2"), a1("D3")}
    assert simulator.get_cell("B3").calculated_by is None

    assert simulator.get_cell("B4").depends_on == set()
    assert simulator.get_cell("B4").feeds_into == set()
    assert simulator.get_cell("B4").calculated_by is None

    assert simulator.get_cell("C2").depends_on == set()
    assert simulator.get_cell("C2").feeds_into == {
        a1("C3"),
        a1("C4"),
        a1("C5"),
        a1("D2"),
        a1("D3"),
    }
    assert simulator.get_cell("C2").calculated_by is None

    assert simulator.get_cell("C3").depends_on == set()
    assert simulator.get_cell("C3").feeds_into == {a1("D2"), a1("D3")}
    assert simulator.get_cell("C3").calculated_by == a1("C2")

    assert simulator.get_cell("C4").depends_on == set()
    assert simulator.get_cell("C4").feeds_into == set()
    assert simulator.get_cell("C4").calculated_by == a1("C2")

    assert simulator.get_cell("C5").depends_on == set()
    assert simulator.get_cell("C5").feeds_into == set()
    assert simulator.get_cell("C5").calculated_by == a1("C2")

    assert simulator.get_cell("D2").depends_on == {
        a1("A1"),
        a1("A2"),
        a1("A3"),
        a1("B1"),
        a1("B2"),
        a1("B3"),
        a1("C1"),
        a1("C2"),
        a1("C3"),
    }
    assert simulator.get_cell("D2").feeds_into == set()
    assert simulator.get_cell("D2").calculated_by is None

    assert simulator.get_cell("D3").depends_on == {
        a1("A1"),
        a1("A2"),
        a1("A3"),
        a1("B1"),
        a1("B2"),
        a1("B3"),
        a1("C1"),
        a1("C2"),
        a1("C3"),
    }
    assert simulator.get_cell("D3").feeds_into == set()
    assert simulator.get_cell("D3").calculated_by is None


def test_insert_row_with_spillover(simulator):
    # 2 cases. Delete before, or inside the range.
    simulator.run_cell("A1", "=range(4)")
    simulator.run_cell("B2", "=range(4)")
    simulator.run_cell("C1", "=SUM(A1:B4)")
    simulator.run_cell("C2", "=SUM(A1:B4)")
    simulator.run_add_delete(SheetTransform.INSERT_BEFORE, Dimension.ROW, 1)

    # Value within range deleted. Don't re-execute range.
    assert simulator.get("A1") == 0
    assert not simulator.get("A2")
    assert simulator.get("A3") == 1
    assert simulator.get("A4") == 2
    assert simulator.get("A5") == 3

    # Range formula is deleted, so delete all spread values as well.
    assert not simulator.get("B2")
    assert simulator.get("B3") == 0
    assert simulator.get("B4") == 1
    assert simulator.get("B5") == 2
    assert simulator.get("B6") == 3

    assert simulator.get("C1") == 9
    assert not simulator.get("C2")
    assert simulator.get("C3") == 9

    # Validate the graph state very precisely.
    simulator.restart()
    assert simulator.get_cell("A1").depends_on == set()
    assert simulator.get_cell("A1").calculated_by is None
    assert simulator.get_cell("A1").feeds_into == {
        a1("A3"),
        a1("A4"),
        a1("A5"),
        a1("C1"),
        a1("C3"),
    }

    assert simulator.get_cell("A3").depends_on == set()
    assert simulator.get_cell("A3").feeds_into == {a1("C1"), a1("C3")}
    assert simulator.get_cell("A3").calculated_by == a1("A1")

    assert simulator.get_cell("A4").depends_on == set()
    assert simulator.get_cell("A4").feeds_into == {a1("C1"), a1("C3")}
    assert simulator.get_cell("A4").calculated_by == a1("A1")

    assert simulator.get_cell("A5").depends_on == set()
    assert simulator.get_cell("A5").feeds_into == {a1("C1"), a1("C3")}
    assert simulator.get_cell("A5").calculated_by == a1("A1")

    assert simulator.get_cell("B3").depends_on == set()
    assert simulator.get_cell("B3").feeds_into == {
        a1("B4"),
        a1("B5"),
        a1("B6"),
        a1("C1"),
        a1("C3"),
    }
    assert simulator.get_cell("B3").calculated_by is None

    assert simulator.get_cell("B4").depends_on == set()
    assert simulator.get_cell("B4").feeds_into == {a1("C1"), a1("C3")}
    assert simulator.get_cell("B4").calculated_by == a1("B3")

    assert simulator.get_cell("B5").depends_on == set()
    assert simulator.get_cell("B5").feeds_into == {a1("C1"), a1("C3")}
    assert simulator.get_cell("B5").calculated_by == a1("B3")

    assert simulator.get_cell("B6").depends_on == set()
    assert simulator.get_cell("B6").feeds_into == set()
    assert simulator.get_cell("B6").calculated_by == a1("B3")

    assert simulator.get_cell("C1").depends_on == {
        a1("A1"),
        a1("A2"),
        a1("A3"),
        a1("A4"),
        a1("A5"),
        a1("B1"),
        a1("B2"),
        a1("B3"),
        a1("B4"),
        a1("B5"),
    }
    assert simulator.get_cell("C1").feeds_into == set()
    assert simulator.get_cell("C1").calculated_by is None

    assert simulator.get_cell("C3").depends_on == {
        a1("A1"),
        a1("A2"),
        a1("A3"),
        a1("A4"),
        a1("A5"),
        a1("B1"),
        a1("B2"),
        a1("B3"),
        a1("B4"),
        a1("B5"),
    }
    assert simulator.get_cell("C3").feeds_into == set()
    assert simulator.get_cell("C3").calculated_by is None


def test_undo_redo_insert_delete(simulator):
    simulator.run_cell("A1", "=1")
    simulator.run_cell("A2", "=2")
    simulator.run_cell("B1", "=range(3)")

    undo = simulator.run_add_delete(SheetTransform.DELETE, Dimension.ROW, 1)

    assert simulator.get("B2") == 2
    assert not simulator.get("A2")

    simulator.undo(undo)

    assert simulator.get("A2") == 2
    assert simulator.get("B3") == 2
    assert simulator.get("B2") == 1


def test_row_and_column_ranges(simulator):
    simulator.run_cell("A1", "=1")
    simulator.run_cell("A2", "=2")
    simulator.run_cell("B1", "=SUM(A1:A)")
    simulator.run_cell("C3", "=SUM(A2:B)")
    simulator.run_cell("C4", "=SUM(A1:1)")

    assert simulator.get("B1") == 3
    assert simulator.get("C3") == 2
    assert simulator.get("C4") == 4


def test_insert_delete_with_row_and_column_ranges_goalpost_delete(simulator):
    simulator.run_cell("A1", "=range(4)")
    simulator.run_cell("B1", "=range(4)")
    simulator.run_cell("C1", "=SUM(A3:B)")
    simulator.run_cell("C2", "=SUM($A1:$B)")

    assert simulator.get("C1") == 10
    assert simulator.get("C2") == 12

    undo = simulator.run_add_delete(SheetTransform.DELETE, Dimension.ROW, 2)

    assert simulator.get("C1") == 6
    assert simulator.get("C2") == 8

    simulator.undo(undo)

    assert simulator.get("A3") == 2
    assert simulator.get("A4") == 3
    assert simulator.get("C1") == 10
    assert simulator.get("C2") == 12


def test_undo_delete_empty_cell(simulator):
    simulator.run_cell("A2", "=1")
    simulator.run_cell("C5", "=SUM(A1:A5)")

    undo = simulator.run_add_delete(SheetTransform.DELETE, Dimension.ROW, 0, amount=2)

    assert not simulator.get("A1")
    assert not simulator.get("A2")
    assert simulator.get("C3") == 0

    simulator.undo(undo)

    assert not simulator.get("A1")
    assert simulator.get("A2") == 1
    assert not simulator.get("C3")
    assert simulator.get("C5") == 1


def test_multidimensional_spill_delete(simulator):
    simulator.run_cell("A1", "=[range(3) for i in range(3)]")
    assert simulator.get("A1") == 0
    assert simulator.get("A2") == 0
    assert simulator.get("A3") == 0
    assert simulator.get("B1") == 1
    assert simulator.get("B2") == 1
    assert simulator.get("B3") == 1
    assert simulator.get("C1") == 2
    assert simulator.get("C2") == 2
    assert simulator.get("C3") == 2

    undo = simulator.run_add_delete(SheetTransform.DELETE, Dimension.ROW, 0)
    assert not simulator.get("A1")
    assert not simulator.get("A2")
    assert not simulator.get("A3")
    assert not simulator.get("B1")
    assert not simulator.get("B2")
    assert not simulator.get("B3")
    assert not simulator.get("C1")
    assert not simulator.get("C2")
    assert not simulator.get("C3")

    simulator.undo(undo)
    assert simulator.get("C1") == 2
    assert simulator.get("C2") == 2
    assert simulator.get("C3") == 2
    assert simulator.get("A1") == 0
    assert simulator.get("A2") == 0
    assert simulator.get("A3") == 0
    assert simulator.get("B1") == 1
    assert simulator.get("B2") == 1
    assert simulator.get("B3") == 1


def test_multi_row_insert_with_undo(simulator):
    simulator.run_cell("A1", "=1")
    simulator.run_cell("A2", "=2")
    simulator.run_cell("A3", "=3")
    simulator.run_cell("B1", "=SUM(A1:A3)")
    undo = simulator.run_add_delete(
        SheetTransform.INSERT_BEFORE, Dimension.ROW, 1, amount=2
    )
    assert simulator.get("A1") == 1
    assert not simulator.get("A2")
    assert not simulator.get("A3")
    assert simulator.get("A4") == 2
    assert simulator.get("A5") == 3
    assert simulator.get("B1") == 6

    simulator.undo(undo)

    assert simulator.get("A1") == 1
    assert simulator.get("A2") == 2
    assert simulator.get("A3") == 3
    assert not simulator.get("A4")
    assert not simulator.get("A5")
    assert simulator.get("B1") == 6


def test_multi_row_delete_with_undo(simulator):
    simulator.run_cell("A1", "=1")
    simulator.run_cell("A2", "=2")
    simulator.run_cell("A3", "=3")
    simulator.run_cell("A4", "=4")
    simulator.run_cell("B1", "=SUM(A1:A4)")
    undo = simulator.run_add_delete(SheetTransform.DELETE, Dimension.ROW, 1, amount=2)

    assert simulator.get("A1") == 1
    assert simulator.get("A2") == 4
    assert not simulator.get("A3")
    assert not simulator.get("A4")
    assert simulator.get("B1") == 5

    simulator.undo(undo)

    assert simulator.get("A1") == 1
    assert simulator.get("A2") == 2
    assert simulator.get("A3") == 3
    assert simulator.get("A4") == 4
    assert simulator.get("B1") == 10


def test_shift_cell_into_spillover_place(simulator):
    simulator.run_cell("A1", "=range(3)")
    assert simulator.get("A1") == 0
    simulator.run_cell("B1", "=10")
    simulator.run_cell("C2", "=SUM(B1:B3)")

    undo = simulator.run_add_delete(SheetTransform.DELETE, Dimension.COL, 0)
    assert simulator.get("A1") == 10
    assert not simulator.get("A2")
    assert not simulator.get("A3")
    assert not simulator.get("B1")
    assert simulator.get("B2") == 10

    simulator.undo(undo)
    assert simulator.get("A2") == 1
    assert simulator.get("A3") == 2
    assert simulator.get("A1") == 0
    assert simulator.get("B1") == 10
    assert not simulator.get("B2")
    assert simulator.get("C2") == 10


def test_insert_delete_with_infinite_range_recalculation(simulator):
    simulator.run_cell("A2", "=range(3)")
    simulator.run_cell("B2", "5")
    simulator.run_cell("C3", "=SUM(A2:B)")
    assert simulator.get("C3") == 8

    n_cols, n_rows = simulator.get_sheet_size(0)
    simulator.run_add_delete(SheetTransform.INSERT_BEFORE, Dimension.ROW, 30)

    new_cell_address = f"A{n_rows + 1}"
    simulator.run_cell(new_cell_address, "1")

    assert simulator.get("C3") == 9


def test_insert_delete_last_row_with_hidden_headers(simulator):
    n_rows, n_cols = DEFAULT_GRID_SIZE
    simulator.run_cell("A1000", "1")
    simulator.run_add_delete(SheetTransform.INSERT_BEFORE, Dimension.ROW, n_cols - 1)
    assert simulator.get("A1001") == 1


def test_grid_resizes_on_value_set(simulator):
    simulator.run_cell("A1", "1")
    simulator.run_cell("AB1", "=A1")
    assert simulator.get_sheet_size(0)[0] == 28


def test_editor_is_modified_on_insert_delete(simulator):
    simulator.set_code_pane("B2 = 1")
    simulator.run_add_delete(SheetTransform.INSERT_BEFORE, Dimension.ROW, 0)
    assert simulator.get_code_pane() == "B3 = 1\n"
    simulator.run_add_delete(SheetTransform.DELETE, Dimension.ROW, 0)
    assert simulator.get_code_pane() == "B2 = 1\n"
    simulator.run_add_delete(SheetTransform.DELETE, Dimension.ROW, 0)
    assert simulator.get_code_pane() == "B1 = 1\n"
    simulator.run_add_delete(SheetTransform.DELETE, Dimension.ROW, 0)
    assert simulator.get_code_pane() == "REF_ERROR = 1\n"


def test_editor_is_modified_on_insert_delete_respects_boundary(simulator):
    def editor_fn_wrap(s):
        return f"def fn():\n    {s}"

    def editor_validate(s):
        assert simulator.get_code_pane().replace(" ", "").replace(
            "deffn():\n", ""
        ).replace("\n", "") == s.replace(" ", "")

    simulator.set_code_pane(editor_fn_wrap("A1 = 1"))
    simulator.repl_command("A1:B2.insert_row(0)")
    editor_validate("A1 = 1")

    simulator.repl_command("A1:B2.insert_row(0)")
    editor_validate("A1 = 1")

    simulator.repl_command("A1:1.insert_row(0)")
    editor_validate("A2 = 1")

    simulator.repl_command("A1:10.insert_row(0, amount=3)")
    editor_validate("A5 = 1")

    simulator.repl_command("A10:20.insert_row(0)")
    editor_validate("A5 = 1")


def test_header_sizes_is_modified_on_insert_delete(simulator):
    simulator.set_sheet_attribute(
        0, SheetAttribute.COLS_SIZES.value, {"2": 300, "4": 200}
    )
    simulator.run_add_delete(SheetTransform.INSERT_BEFORE, Dimension.COL, 0)

    assert simulator.get_sheet_attribute(0, SheetAttribute.COLS_SIZES.value) == {
        "3": 300,
        "5": 200,
    }
    simulator.run_add_delete(SheetTransform.INSERT_BEFORE, Dimension.COL, 4)
    assert simulator.get_sheet_attribute(0, SheetAttribute.COLS_SIZES.value) == {
        "3": 300,
        "6": 200,
    }
    simulator.run_add_delete(SheetTransform.INSERT_BEFORE, Dimension.COL, 3)
    assert simulator.get_sheet_attribute(0, SheetAttribute.COLS_SIZES.value) == {
        "3": 300,
        "4": 300,
        "7": 200,
    }
    simulator.run_add_delete(SheetTransform.DELETE, Dimension.COL, 3)
    assert simulator.get_sheet_attribute(0, SheetAttribute.COLS_SIZES.value) == {
        "3": 300,
        "6": 200,
    }


def test_frozen_columns_is_modified_on_insert_delete(simulator):
    simulator.set_sheet_attribute(0, "colsFrozenCount", 2)
    simulator.run_add_delete(SheetTransform.INSERT_BEFORE, Dimension.COL, 0)
    assert simulator.get_sheet_attribute(0, "colsFrozenCount") == 3
    simulator.run_add_delete(SheetTransform.INSERT_BEFORE, Dimension.COL, 4)
    assert simulator.get_sheet_attribute(0, "colsFrozenCount") == 3
    simulator.run_add_delete(SheetTransform.INSERT_BEFORE, Dimension.COL, 2)
    assert simulator.get_sheet_attribute(0, "colsFrozenCount") == 4
    simulator.run_add_delete(SheetTransform.DELETE, Dimension.COL, 4)
    assert simulator.get_sheet_attribute(0, "colsFrozenCount") == 4
    simulator.run_add_delete(SheetTransform.DELETE, Dimension.COL, 3)
    assert simulator.get_sheet_attribute(0, "colsFrozenCount") == 3


def test_hidden_headers_is_modified_on_insert_delete(simulator):
    simulator.set_sheet_attribute(0, "rowsHiddenHeaders", [2, 4])
    simulator.run_add_delete(SheetTransform.INSERT_BEFORE, Dimension.ROW, 0)
    assert simulator.get_sheet_attribute(0, "rowsHiddenHeaders") == [3, 5]
    simulator.run_add_delete(SheetTransform.INSERT_BEFORE, Dimension.ROW, 5)
    assert simulator.get_sheet_attribute(0, "rowsHiddenHeaders") == [3, 6]
    simulator.run_add_delete(SheetTransform.DELETE, Dimension.ROW, 4)
    assert simulator.get_sheet_attribute(0, "rowsHiddenHeaders") == [3, 5]
    simulator.run_add_delete(SheetTransform.DELETE, Dimension.ROW, 3)
    assert simulator.get_sheet_attribute(0, "rowsHiddenHeaders") == [4]


def test_cell_attributes_attached_to_new_row_on_insert(simulator):
    simulator.set_cell_attribute(a1("A1"), "background_color", "#FF0000")
    simulator.set_cell_attribute(a1("A3"), "background_color", "#FFFF00")

    simulator.run_add_delete(SheetTransform.INSERT_BEFORE, Dimension.COL, 0, amount=2)
    assert simulator.get_attribute(a1("A1"), "background_color") == "#FF0000"
    assert simulator.get_attribute(a1("A3"), "background_color") == "#FFFF00"
    assert simulator.get_attribute(a1("B1"), "background_color") == "#FF0000"
    assert simulator.get_attribute(a1("B3"), "background_color") == "#FFFF00"
    assert simulator.get_attribute(a1("C1"), "background_color") == "#FF0000"
    assert simulator.get_attribute(a1("C3"), "background_color") == "#FFFF00"
    assert not simulator.get_attribute(a1("A2"), "background_color")
    assert not simulator.get_attribute(a1("B2"), "background_color")
    assert not simulator.get_attribute(a1("C2"), "background_color")

    simulator.run_add_delete(SheetTransform.INSERT_BEFORE, Dimension.ROW, 2, amount=2)
    assert simulator.get_attribute(a1("A1"), "background_color") == "#FF0000"
    assert simulator.get_attribute(a1("B1"), "background_color") == "#FF0000"
    assert simulator.get_attribute(a1("C1"), "background_color") == "#FF0000"
    assert not simulator.get_attribute(a1("A2"), "background_color")
    assert not simulator.get_attribute(a1("B2"), "background_color")
    assert not simulator.get_attribute(a1("C2"), "background_color")
    assert simulator.get_attribute(a1("A3"), "background_color") == "#FFFF00"
    assert simulator.get_attribute(a1("B3"), "background_color") == "#FFFF00"
    assert simulator.get_attribute(a1("C3"), "background_color") == "#FFFF00"
    assert simulator.get_attribute(a1("A3"), "background_color") == "#FFFF00"
    assert simulator.get_attribute(a1("B4"), "background_color") == "#FFFF00"
    assert simulator.get_attribute(a1("C4"), "background_color") == "#FFFF00"
    assert simulator.get_attribute(a1("A5"), "background_color") == "#FFFF00"
    assert simulator.get_attribute(a1("B5"), "background_color") == "#FFFF00"
    assert simulator.get_attribute(a1("C5"), "background_color") == "#FFFF00"


def test_drag_row_column(simulator):
    simulator.run_cell("A1", "1")
    simulator.run_cell("C1", "=[[2,3],[4,5]]")
    undo_msg = simulator.drag_row_column(
        DragRowColumnContent(
            amount=2, dimension=Dimension.COL, from_index=2, to_index=8, sheet_id=0
        )
    )
    assert simulator.get("A1") == 1
    assert not simulator.get("C1")
    assert simulator.get("I1") == 2
    assert simulator.get("J1") == 3
    simulator.undo(undo_msg)
    assert simulator.get("A1") == 1
    assert simulator.get("C1") == 2
    assert not simulator.get("I1")
    assert not simulator.get("J1")


def test_insert_returns_cell_range(simulator):
    simulator.repl_command("tmp = A1:D10.insert_row(0,[[1,2,3,4],[4,5,6,7]])")
    simulator.repl_command("F1 = tmp")
    assert simulator.get("F1") == 1
    assert simulator.get("I2") == 7
    simulator.repl_command("tmp2 = A1:D10.insert_column(2,[[1,2,3,4],[4,5,6,7]])")
    simulator.repl_command("F3 = tmp2")
    assert simulator.get("F3") == 1
    assert simulator.get("I4") == 7


def test_recursion(simulator):
    simulator.repl_command("def log(cr): cr.append_row([0])")
    simulator.run_cell("A1", "=[log(B1:B)]")
    assert simulator.get("B1") == 0
    assert simulator.get("B2") is None


def test_insert_delete_preserves_widget_value(simulator):
    simulator.run_cell("D1", "=range(5)")
    simulator.run_cell("A1", "=Dropdown(D1:D4)")
    assert simulator.get("A1").value == 0

    simulator.repl_command("A1.value = 2")
    assert simulator.get("A1").value == 2

    simulator.run_add_delete(SheetTransform.DELETE, Dimension.COL, 1)
    assert simulator.get("A1").value == 2
    assert simulator.get("C2") == 1
    assert simulator.get_cell("A1").raw_code == "=Dropdown(C1:C4)"
    assert simulator.get("A1").choices == [0, 1, 2, 3]


def test_insert_delete_with_multi_dim_arrays(simulator):
    simulator.repl_command("A1 = [[[[1,2,3],[4,5,6]]]]")
    simulator.repl_command("B1 = [[1,2],[3,4]]")
    simulator.run_cell("D1", "=[[1,2],[3,4]]")

    assert simulator.get("A1") == [[1, 2, 3], [4, 5, 6]]
    assert not simulator.get("A2")
    assert simulator.get("B1") == 1
    assert simulator.get("C2") == 4
    assert simulator.get("D1") == 1
    assert simulator.get("E2") == 4

    simulator.run_add_delete(SheetTransform.INSERT_BEFORE, Dimension.ROW, 0)

    assert simulator.get("A2") == [[1, 2, 3], [4, 5, 6]]
    assert not simulator.get("A3")
    assert simulator.get("B2") == 1
    assert simulator.get("C3") == 4
    assert simulator.get("D2") == 1
    assert simulator.get("E3") == 4

    simulator.run_add_delete(SheetTransform.DELETE, Dimension.ROW, 0)

    assert simulator.get("A1") == [[1, 2, 3], [4, 5, 6]]
    assert not simulator.get("A2")
    assert simulator.get("B1") == 1
    assert simulator.get("C2") == 4
    assert simulator.get("D1") == 1
    assert simulator.get("E2") == 4

    simulator.run_cell("B1", "")
    simulator.run_cell("D1", "")

    assert simulator.get("C2") == 4
    assert not simulator.get("E2")

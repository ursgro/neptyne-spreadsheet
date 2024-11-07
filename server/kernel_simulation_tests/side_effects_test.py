from neptyne_kernel.cell_address import Address
from neptyne_kernel.dash import MAX_CASCADE_COUNT
from neptyne_kernel.spreadsheet_error import SpreadsheetError


def test_side_effect_only_runs_once(simulator):
    simulator.run_cell("J1", "0")
    simulator.repl_command("def inc(): J1 = J1 + 1; return 8")
    simulator.run_cell("A1", "=inc()")
    assert simulator.get("A1") == 8
    assert simulator.get("J1") == 1
    simulator.run_cell("A1", "=inc()")
    assert simulator.get("J1") == 2


def test_roll_side_effects(simulator):
    simulator.run_cell("B1", "=A1")
    simulator.run_cell("B2", "=A2")
    simulator.run_cell("A1", "=range(1, 3)", expected_cells={"B1", "B2"})
    assert simulator.get("B1") == 1
    assert simulator.get("B2") == 2

    simulator.run_cell("F1", "=1")
    simulator.run_cell("G1", "=range(F1 + 1, F1 + 5)")
    simulator.run_cell("H2", "=G2 + 1", expected_cells={"H2"})
    assert simulator.get("H2") == 4

    # Changing F1 recalculates the range in G1, but should keep G1 was the calculated_by cell
    simulator.run_cell("F1", "=2", expected_cells={"H2"})
    assert simulator.get("H2") == 5

    # If G1 is not the calculated_by cell, changing G1 should not change G2
    simulator.run_cell("G1", "=3", expected_cells={"G2"})
    assert simulator.get("G2") is None


def test_notebook_side_effects(simulator):
    simulator.repl_command("def side_effect(x): F1 = 3; return x + 1")
    simulator.run_cell("F2", "=1")
    simulator.run_cell("F4", "=F1 + 1")
    simulator.run_cell("F5", "=F4 + 1")
    simulator.run_cell(
        "F3", "=side_effect(F2)", expected_cells={"F5", "F4"}, verbose=True
    )
    assert simulator.get("F4") == 4
    assert simulator.get("F5") == 5


def test_handle_cycles(simulator):
    simulator.repl_command("def double(x): return x * 2")
    simulator.run_cell("A1", "2")
    simulator.run_cell("A1", "=double(A1)")
    assert simulator.get("A1") == 4

    simulator.run_cell("D2", "2")
    simulator.run_cell("D1", "=D2")
    simulator.run_cell("D2", "=D1")

    assert isinstance(simulator.get("D2"), SpreadsheetError)
    assert isinstance(simulator.get("D1"), SpreadsheetError)


def test_side_effect_infinte_cascade(simulator):
    simulator.repl_command("def update_A2(other): A2 = other + 1; return other")
    simulator.repl_command("def update_B2(other): B2 = other + 1; return other")
    simulator.run_cell("A1", "=update_B2(A2)")
    simulator.run_cell("B1", "=update_A2(B2)")
    assert simulator.get("A1") == 10


def test_do_events(simulator):
    simulator.run_cell("B1", "=A1")
    simulator.repl_command(
        "import neptyne as nt\n\n"
        "async def test():\n"
        "    for i in range(10):\n"
        "        A1 = i\n"
        "        await nt.do_events()\n"
        "        if i == 5:\n"
        "            C1 = B1\n"
        "    return 1"
    )
    simulator.repl_command("await test()")
    assert simulator.get("C1") == 5


def test_side_effect_loop(simulator):
    simulator.repl_command(
        """
def increment_B1(x):
    B1 += 1
    return B1

def increment_C1(x):
    C1 += 1
    return C1

def increment_D1(x):
    D1 += 1
    return D1

def update_A1():
    A1 += 1
"""
    )
    assert simulator.get("B1") is None
    simulator.run_cell("B2", "=increment_B1(A1)")
    simulator.run_cell("C2", "=increment_C1(B1)")
    simulator.run_cell("D2", "=increment_D1(C1)")
    assert simulator.get("B1") == 1
    assert simulator.get("C1") == 1
    assert simulator.get("D1") == 1
    simulator.repl_command("update_A1()")
    assert simulator.get("B1") == 2
    assert simulator.get("C1") == 2
    assert simulator.get("D1") == 2
    simulator.repl_command("update_A1()")
    assert simulator.get("B1") == 3
    assert simulator.get("C1") == 3
    assert simulator.get("D1") == 3


def test_maximum_cascade_side_effect(simulator):
    simulator.repl_command(
        """
def update_A1():
    A1 += 1
"""
    )

    cells = []
    for level in range(MAX_CASCADE_COUNT + 2):
        cell = Address(level + 1, 0, 0).to_a1()
        cells.append(cell)
        simulator.repl_command(
            f"""
def increment_{cell}(x):
    {cell} += 1
    return {cell}
"""
        )

    cells_before = ["A1", *cells]
    for cell_before, cell in zip(cells_before, cells):
        below = cell[:-1] + "2"
        simulator.run_cell(below, f"=increment_{cell}({cell_before})")

    for cell in cells:
        assert simulator.get(cell) == 1

    simulator.run_cell("A1", "=1")

    for cell in cells[:-1]:
        assert simulator.get(cell) == 2

    assert simulator.get(cells[-1]) == 1


def test_spill_side_effect_loop(simulator):
    simulator.repl_command(
        """
def increment_B1(x):
    B1 += 1
    return B1

def increment_C1(x):
    C1 += 1
    return C1

def increment_D1(x):
    D1 += 1
    return D1


def set_A1_range():
    A1 = range(5)
"""
    )
    assert simulator.get("B1") is None
    simulator.run_cell("B2", "=increment_B1(A3)")
    simulator.run_cell("C2", "=increment_C1(B1)")
    simulator.run_cell("D2", "=increment_D1(C1)")
    assert simulator.get("B1") == 1
    assert simulator.get("C1") == 1
    assert simulator.get("D1") == 1
    simulator.run_cell("A1", "=set_A1_range()")
    assert simulator.get("B1") == 2
    assert simulator.get("C1") == 2
    assert simulator.get("D1") == 2
    simulator.run_cell("A1", "=set_A1_range()")
    assert simulator.get("B1") == 3
    assert simulator.get("C1") == 3
    assert simulator.get("D1") == 3

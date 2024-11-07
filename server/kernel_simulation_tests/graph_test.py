from neptyne_kernel.cell_address import Address
from neptyne_kernel.neptyne_protocol import (
    MIMETypes,
)
from neptyne_kernel.test_utils import a1


def trace_cells_depends_on(simulator, cell_id: Address, seen=None):
    if seen is None:
        seen = set()
    if cell_id in seen:
        # cycle:
        raise ValueError("Circular dependency between cells not allowed for functions")
    res = [cell_id]
    seen.add(cell_id)
    for other_cell in simulator.get_cell(cell_id).depends_on:
        res.extend(trace_cells_depends_on(simulator, other_cell, seen))
    seen.remove(cell_id)
    return res


def test_dependency_graph(simulator):
    simulator.run_cell("A1", "500")
    simulator.repl_command("print(A1)")
    assert len(simulator.get_cell("A1").feeds_into) == 0

    simulator.run_cell("B1", "=A1")
    simulator.run_cell("C1", "=A1")
    simulator.run_cell("D1", "=B1 + C1")
    simulator.run_cell("E1", "100")

    graph = trace_cells_depends_on(simulator, a1("D1"))
    assert set(graph) == {
        a1("A1"),
        a1("B1"),
        a1("C1"),
        a1("D1"),
    }

    graph = trace_cells_depends_on(simulator, a1("A1"))
    assert set(graph) == {a1("A1")}

    graph = trace_cells_depends_on(simulator, a1("C1"))
    assert set(graph) == {a1("C1"), a1("A1")}

    simulator.run_cell("A1", "=D1")
    simulator.get_kernel_state()
    assert simulator.get_cell("A1").output.data[
        MIMETypes.APPLICATION_VND_NEPTYNE_ERROR_V1_JSON.value
    ]


def test_graph_recomputation(simulator):
    simulator.run_cell("A1", "500")
    simulator.run_cell("B1", "=A1")
    simulator.run_cell("C1", "=A1")
    simulator.run_cell("D1", "=B1 + C1")
    simulator.run_cell("E1", "100")
    simulator.run_cell("A1", "1000")
    simulator.get_kernel_state()

    assert simulator.get("A1") == 1000
    assert simulator.get("B1") == 1000
    assert simulator.get("C1") == 1000
    assert simulator.get("D1") == 2000
    assert simulator.get("E1") == 100

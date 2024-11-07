import math
import os
import string
from unittest import mock

import pytest
from jupyter_client.utils import run_sync

from neptyne_kernel.cell_address import format_cell, parse_cell
from neptyne_kernel.neptyne_protocol import (
    CellAttribute,
    CellAttributesUpdate,
    CellAttributeUpdate,
    CellChange,
    CopyCellsContent,
    MessageTypes,
    PopulateFrom,
    SheetAttributeUpdate,
    SheetAutofillContent,
)
from neptyne_kernel.session_info import NeptyneSessionInfo
from neptyne_kernel.spreadsheet_error import (
    SYNTAX_ERROR,
    ZERO_DIV_ERROR,
)
from neptyne_kernel.test_utils import a1
from neptyne_kernel.widgets.output_widgets import PLOTLY_MIME_TYPE
from server.messages import (
    HEADER_TAG,
    IS_INIT_CELL_TAG,
    PARENT_HEADER_TAG,
)

from .. import tyne_content
from ..models import Notebook


# We have state leakage. This test needs to be run first, otherwise things fail. Ouch.
@pytest.mark.timeout(10)
def test_only_one_display_output(simulator):
    simulator.repl_command("import plotly.express as px")
    simulator.run_cell("A1", "=range(1, 4)")
    simulator.run_cell("B1", "=px.pie(values=list(A1:A3))", expected_cells=set())
    simulator.run_cell("B2", "Hello!")
    output = simulator.get_cell("B1").output
    assert set(output.data.keys()) == {"text/plain", "text/html", PLOTLY_MIME_TYPE}
    simulator.run_cell("A1", "=range(2, 5)")
    output = simulator.get_cell("B1").output
    assert set(output.data.keys()) == {"text/plain", "text/html", PLOTLY_MIME_TYPE}

    # This should really be in a separate test, but it is here because of the state leakage
    # described above.
    simulator.repl_command("from IPython.display import display, HTML")
    html = "<h1>Hello, world!</h1>"
    simulator.repl_command(f"def show(): display(HTML('{html}'))")

    # display_data is now processed in sheet cells
    simulator.run_cell("A10", "=show()", expected_cells=set())
    # Send another update so we process all the messages:
    simulator.run_cell("B10", "Hello!")
    output = simulator.get_cell("A10").output
    assert output

    # The display hook should unregister
    simulator.repl_command("show()")
    # Send another update so we process all the messages:
    simulator.run_cell("B11", "Hello!")
    outputs = simulator.tyne_info.notebook.get_cell_by_id(
        f"0{simulator.next_repl - 1}"
    ).outputs
    assert len(outputs) == 1
    assert outputs[0].data["text/html"] == html


def test_notebook_cells_have_outputs(simulator):
    simulator.repl_command("1+1")
    outputs = simulator.tyne_info.notebook.get_cell_by_id(
        f"0{simulator.next_repl - 1}"
    ).outputs
    assert len(outputs) == 1
    assert outputs[0].data["text/plain"] == "2"


def test_long_json_not_reformatted(simulator):
    long_json = (
        '{"installed":{"client_id":"226831798457-9j3sadasdasdas.apps.googleusercontent.'
        'com","project_id":"douweosingaprojects","auth_uri":"https://accounts.google.com/o/oauth2/auth","'
        'token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googl'
        'eapis.com/oauth2/v1/certs","client_secret":"datgaikjeheusnooitvertellentoch","redirect_uris":'
        '["http://localhost"]}}'
    )
    simulator.run_cell("A1", long_json)
    assert simulator.get("A1") == long_json
    assert simulator.get_cell("A1").raw_code == long_json


def test_kernel_restart(simulator):
    simulator.run_cell(
        "00", "class Foo:\n    def __init__(self):\n        self.bar = 1"
    )
    simulator.run_cell("A1", "Hello")
    simulator.run_cell("A2", "=Button('click me')")
    simulator.run_cell("01", "A3=[[{'foo': 'bar'}]]")
    simulator.run_cell("A4", "=ExecOp([0, 0, 0], 'foo')")
    simulator.run_cell("B5", "=A4.expression")
    assert simulator.get("B5") == "foo"
    simulator.run_cell("B3", "=A3['foo']", verbose=True)
    assert simulator.get("B3") == "bar"

    msg = simulator.tyne_info.default_msg(
        simulator.simulator_session,
        MessageTypes.RUN_CELLS.value,
        content=SheetAttributeUpdate("foo", 0, "bar").to_dict(),
    )
    simulator.tyne_info.change_sheet_attribute(msg)
    assert simulator.get_sheet_attribute(0, "foo") == "bar"

    simulator.restart()

    assert simulator.get_sheet_attribute(0, "foo") == "bar"
    simulator.run_cell("B1", "=A1", verbose=True)
    simulator.run_cell("B2", "=A2.caption")
    assert simulator.get("A1") == "Hello"
    assert simulator.get("B1") == "Hello"
    assert simulator.get("B2") == "click me"
    assert simulator.get("B3") == "bar"
    simulator.run_cell("C5", "=A4.expression")
    assert simulator.get("C5") == "foo"
    assert simulator.get("A4").expression == "foo"


def test_euro_demo(simulator):
    simulator.run_cell("A1", "Euro")
    assert simulator.get("A1") == "Euro"
    simulator.run_cell("B1", "=range(1, 11)")
    assert simulator.get("B10") == 10
    simulator.run_cell("A2", "=1.15")
    simulator.run_cell("C1", "=B1:B10 * A2")
    assert simulator.get("C10") == 11.5
    undo = simulator.run_cell("A2", "=1.10")
    assert simulator.get("C10") == 11
    simulator.undo(undo)
    assert simulator.get("C10") == 11.5


def test_spill_dependency(simulator):
    simulator.run_cell("A1", "=range(3)")
    simulator.run_cell("B2", "=A2")
    assert simulator.get("B2") == 1
    simulator.run_cell("A1", "")
    assert not simulator.get("B2")


def test_simple(simulator):
    simulator.run_cell("A1", "=range(2)")
    simulator.get_dash().graph.check_integrity()

    simulator.repl_command("A1=range(2)")
    simulator.get_dash().graph.check_integrity()


def test_spill_different_shapes(simulator):
    simulator.run_cell("A1", "=[['abcd', 'efgh'], 'ijkl', 'mnop']")
    assert simulator.get("B1") == "efgh"
    assert simulator.get("A2") == "ijkl"
    simulator.run_cell("A1", "=['asdf', 'dfdf', ['adfda', 3434]]")
    assert simulator.get("A3") == "adfda"
    assert simulator.get("B3") == 3434


def test_spill_and_clear(simulator):
    def setup_range():
        simulator.run_cell("A1", "=range(10)")
        assert simulator.get("B1") == 4

    simulator.run_cell("B1", "=A5")

    setup_range()
    assert simulator.get_cell("A1").raw_code == "=range(10)"
    assert not simulator.get_cell("A2").raw_code

    simulator.run_cell("A1", "5")
    assert not simulator.get("B1")

    setup_range()
    simulator.run_cell("A1", "")
    assert not simulator.get("B1")

    setup_range()
    simulator.repl_command("A1.clear()")
    assert not simulator.get("B1")

    simulator.repl_command("A1=range(10)")
    assert simulator.get_cell("A1").raw_code == "0"
    assert simulator.get_cell("A10").raw_code == "9"

    rc = "=[range(10) for _ in range(10)]"
    simulator.run_cell("A1", rc)
    assert simulator.get_cell("A1").raw_code == rc
    assert not simulator.get_cell("A10").raw_code
    assert not simulator.get_cell("J1").raw_code
    assert not simulator.get_cell("J10").raw_code

    simulator.repl_command("A1" + rc)
    assert simulator.get_cell("A1").raw_code == "0"
    assert simulator.get_cell("A10").raw_code == "0"
    assert simulator.get_cell("J1").raw_code == "9"
    assert simulator.get_cell("J10").raw_code == "9"


def test_range_update(simulator):
    simulator.run_cell("A10", "1")
    simulator.run_cell("A11", "=A10:A10")
    assert simulator.get("A11") == 1

    simulator.repl_command("def inc(num1, num2): return num1 + 1")
    simulator.run_cell("G1", "=inc(G1, A8)")
    simulator.run_cell("A1", "=range(1, 11)")
    assert simulator.get("A10") == 10
    simulator.run_cell("A1", "=range(1, 6)")
    assert simulator.get("A10") is None
    assert simulator.get("G1") == 3
    simulator.run_cell("B1", "=range(1, 6)")
    simulator.run_cell("C1", "=A1:A5 + B1:B5")
    assert simulator.get("C5") == 10


def test_range_over_range(simulator):
    simulator.run_cell("A2", "=range(2)")
    simulator.run_cell("A1", "=range(4)")
    assert simulator.get("A1") == 0
    assert simulator.get("A2") == 1
    assert simulator.get("A3") == 2
    assert simulator.get("A4") == 3
    simulator.run_cell("A1", "")
    assert not simulator.get("A1")
    assert not simulator.get("A2")
    assert not simulator.get("A3")
    assert not simulator.get("A4")

    simulator.run_cell("B2", "=range(7)")
    assert simulator.get("B6") == 4
    simulator.run_cell("B1", "=range(4)")
    assert not simulator.get("B6")


def test_last_writer_wins_unroll(simulator):
    simulator.run_cell("A2", "test")
    simulator.run_cell("A1", "=range(3)")
    assert simulator.get("A2") == 1
    simulator.run_cell("A2", "test2")
    assert simulator.get("A2") == "test2"
    simulator.run_cell("A1", "=range(1, 4)")
    assert simulator.get("A2") == 2
    simulator.repl_command("A1='hello'")
    assert simulator.get("A2") is None


def test_uneven_unroll(simulator):
    simulator.run_cell("A1", "=[[1, 2, 3], [4, 5]]")
    assert simulator.get("C1") == 3
    assert simulator.get("C2") is None

    simulator.run_cell("A5", "=[[1, 2, 3], 4]")
    assert simulator.get("C5") == 3
    assert simulator.get("A6") == 4


def test_cascade(simulator):
    ROWS = 5
    prev = ""
    for col in string.ascii_uppercase:
        for row in range(1, ROWS + 1):
            cell_id = col + str(row)
            simulator.run_cell(cell_id, "=" + prev + "1")
            prev = cell_id + "+"
    assert simulator.get("Z" + str(ROWS)) == ROWS * 26

    simulator.run_cell("A1", "=2")
    assert simulator.get("Z" + str(ROWS)) == ROWS * 26 + 1


def test_unroll_dependencies(simulator):
    simulator.run_cell("A1", "=range(1, 3)")
    simulator.run_cell("B1", "=A1")
    simulator.run_cell("B2", "=A2")
    simulator.run_cell("C1", "=SUM(A1:A3)")
    assert simulator.get("B1") == 1
    assert simulator.get("B2") == 2
    assert simulator.get("C1") == 3
    simulator.run_cell("A1", "=range(0, 2)")
    assert simulator.get("B1") == 0
    assert simulator.get("B2") == 1
    assert simulator.get("C1") == 1
    simulator.run_cell("A1", "0")
    assert simulator.get("C1") == 0


def test_missing_edge_double_spilling(simulator):
    simulator.run_cell("A9", "3")
    simulator.run_cell("A10", "3")
    simulator.run_cell("B9", "=[range(A9, A9 + 2)]")
    simulator.run_cell("B10", "=[range(A10, A10 + 2)]")
    simulator.run_cell("D9", "=A9:A10 + 1")
    simulator.run_cell("E9", "=C9:C10 + D9:D10")
    assert simulator.get("E9") == 8
    assert simulator.get("E10") == 8
    simulator.run_cell("A9", "4")
    assert simulator.get("E9") == 10


def test_handle_block_cycles(simulator):
    simulator.run_cell(
        "02", "def sumit_plus_1(r): return 1 + sum(x for y in r for x in y)"
    )
    simulator.run_cell("A1", "1")
    simulator.run_cell("A2", "1")
    simulator.run_cell("B1", "1")
    simulator.run_cell("B2", "1")

    simulator.run_cell("A1", "=sumit_plus_1(A1:B2)")

    assert simulator.get("A1") == 5

    simulator.run_cell("A1", "=sumit_plus_1(A1:B2)")

    assert simulator.get("A1") == 9


def test_errors(simulator):
    simulator.run_cell("A1", "=COT(0)")
    simulator.run_cell("A2", "=IFERROR(A1, 'OOPS')")
    assert simulator.get("A2") == "OOPS"
    simulator.run_cell("A1", "JA")
    assert simulator.get("A2") == "JA"

    simulator.run_cell("A1", "=COT(0")
    assert simulator.get("A1").ename == SYNTAX_ERROR.ename
    assert simulator.get("A2") == "OOPS"

    simulator.run_cell("B1", "=1/0")
    simulator.run_cell("B2", "=IFERROR(B1, 'OOPS')")
    assert simulator.get("B2") == "OOPS"

    simulator.run_cell("01", "print(COT(0")


def test_available_functions(simulator):
    simulator.run_cell(
        "01", "def hb(cr): 'hb rules'; return [max(cr)+1] + cr[:len(cr)-1]"
    )

    available = simulator.call_server_function("available_functions", {"prefix": "h"})
    assert available[0] == ["hb", "hb rules", ["cr"]]

    available = simulator.call_server_function("available_functions", {"prefix": "S"})
    assert len(available) > 20


def test_propertise_are_not_evaluated_for_autocomplete(simulator):
    simulator.run_cell(
        "01",
        """
class Foo:
    def __init__(self):
        self.prop_evals = 0

    @property
    def prop(self):
        self.prop_evals += 1
        return self.prop_evals

foo = Foo()
""",
    )

    simulator.run_cell("A1", "=N_.kernel.do_complete('foo.', 4)['matches'][0]")
    result = simulator.get("A1")
    assert result == "prop"
    simulator.run_cell("A2", "=foo.prop_evals")
    result = simulator.get("A2")
    assert result == 0


def test_imperative_api(simulator):
    simulator.run_cell("A1", "first")
    simulator.repl_command("A2.value = A1.value + '!'")
    assert simulator.get("A2") == "first!"

    simulator.repl_command("C1=[1, 2, 3]")
    simulator.run_cell("D1", "=C3")
    assert simulator.get("D1") == 3

    simulator.repl_command("m = N10:P12; m[1,1] = 'A'")
    simulator.run_cell("Q1", "=O11")
    assert simulator.get("Q1") == "A"
    simulator.repl_command("m[0, 0]='X', 'Y'")
    simulator.run_cell("R1", "=N11")
    assert simulator.get("R1") == "Y"
    simulator.repl_command("m[1, 0]=[['Z', 'ĳ']]")
    simulator.run_cell("S1", "=O11")
    assert simulator.get("S1") == "ĳ"
    simulator.repl_command("c = O9:O14; c[3] = 'B'")
    simulator.run_cell("Q2", "=O12")
    assert simulator.get("Q2") == "B"
    simulator.repl_command("r = L11:Q11; r[2] = 'C'")
    simulator.run_cell("Q3", "=N11")
    assert simulator.get("Q3") == "C"

    simulator.repl_command("C1:C3=[1, 2, 3]")

    assert simulator.get("C3") == 3


def test_indirect_unroll(simulator):
    simulator.run_cell("A1", "=3")
    simulator.run_cell("B1", "=range(A1)")
    assert simulator.get("B3") == 2
    simulator.run_cell("A1", "=2")
    assert not simulator.get("B3")


def test_cell_attributes(simulator):
    simulator.run_cell("A1", "hello")
    simulator.set_cell_attribute(a1("A1"), CellAttribute.COLOR.value, "#FF00FF")
    simulator.run_cell("Z1", "flush")
    assert simulator.get("A1") == "hello"
    assert simulator.get_attribute("A1", CellAttribute.COLOR.value) == "#FF00FF"
    simulator.set_cell_attribute(a1("A1"), CellAttribute.EXECUTION_POLICY.value, "10")
    assert simulator.get_cell("A1").execution_policy == 10


def test_copy_cells(simulator):
    msg = simulator.tyne_info.default_msg(
        simulator.simulator_session,
        MessageTypes.COPY_CELLS.value,
        content=CopyCellsContent(
            "A1",
            [
                CellChange(
                    attributes=None,
                    cell_id=a1("B1").to_float_coord(),
                    content="=A2",
                    mime_type=None,
                )
            ],
        ).to_dict(),
    )
    simulator.tyne_info.copy_cells(msg)
    simulator.run_cell("B2", "hello")
    assert simulator.get("B1") == "hello"


def test_sheet_drag_formula(simulator):
    msg = simulator.tyne_info.default_msg(
        simulator.simulator_session,
        MessageTypes.SHEET_AUTOFILL.value,
        content=SheetAutofillContent(
            populate_from=[
                PopulateFrom(a1("A1").to_float_coord(), "1"),
                PopulateFrom(a1("A2").to_float_coord(), "Hello"),
                PopulateFrom(a1("B1").to_float_coord(), "2"),
                PopulateFrom(a1("B2").to_float_coord(), "2"),
            ],
            populate_to_start=a1("C1").to_float_coord(),
            populate_to_end=a1("D2").to_float_coord(),
            autofill_context=[],
            table=None,
            to_fill=None,
        ).to_dict(),
    )
    run_sync(simulator.tyne_info.sheet_autofill)(
        msg, kernel_session=simulator.simulator_session
    )
    simulator.run_cell("D3", "=D1 + D2")
    assert simulator.get("D3") == 6
    assert simulator.get("C1") == 3


def test_set_and_execute_other_cell_code(simulator):
    fn_str = """def push_val():
        A2 = '=3'
        return 1"""
    simulator.repl_command(fn_str)
    simulator.run_cell("A1", "=push_val()")
    assert simulator.get("A1") == 1
    assert simulator.get("A2") == 3

    fn_str_2 = """def push_val_2(value):
        C3 = '=SUM(A1:A4) + C2'
        return value"""

    simulator.run_cell("01", fn_str_2)
    simulator.run_cell("C2", "=push_val_2(5)")

    assert simulator.get("C2") == 5
    # NOTE: The update to C3 occurs after C2 has finished executing.
    assert simulator.get("C3") == 9


def test_user_info_in_kernel(simulator):
    def patch_msg(msg):
        NeptyneSessionInfo(
            user_email="test@neptyne.com", user_secrets={"foo": "bar"}
        ).write_to_header(msg[HEADER_TAG])

    simulator.run_cell("01", "import neptyne as nt")
    simulator.run_cell("A1", "=nt.get_user().email", patch_msg=patch_msg)
    assert simulator.get("A1") == "test@neptyne.com"

    simulator.run_cell("A1", "=nt.get_user().secrets['foo']", patch_msg=patch_msg)
    assert simulator.get("A1") == "bar"

    def mock_input():
        return "my_input"

    with mock.patch("ipykernel.ipkernel.builtins.input", mock_input):
        simulator.run_cell("A1", "=nt.get_user().secrets['bar']", patch_msg=patch_msg)
        assert simulator.get("A1") == "my_input"


def test_save_cell(simulator):
    simulator.tyne_info.save_cell("01", "print('hello')", is_init_cell=False)
    assert (
        simulator.tyne_info.notebook.get_cell_by_id("01").raw_code == "print('hello')"
    )
    simulator.tyne_info.save_cell("02", "print('hello')", is_init_cell=True)
    assert simulator.tyne_info.notebook.get_cell_by_id("02").metadata[IS_INIT_CELL_TAG]


def test_tricky_json_values(simulator):
    simulator.run_cell("A1", "=float('nan')")
    assert math.isnan(simulator.get("A1"))
    simulator.run_cell("A2", "=float('inf')")
    assert math.isinf(simulator.get("A2"))
    simulator.restart()
    assert math.isnan(simulator.get("A1"))
    assert math.isinf(simulator.get("A2"))


def test_cell_range_as_dataframe(simulator):
    simulator.run_cell("A1", "A")
    simulator.run_cell("A2", "1")
    simulator.run_cell("A3", "2")

    simulator.run_cell("B1", "B")
    simulator.run_cell("B2", "=1")
    simulator.run_cell("B4", "=3")

    # Since we look at cell metadata, create some here.
    simulator.repl_command("A2.set_background_color(0, 0, 0)")
    simulator.repl_command("df = A1:B4.to_dataframe()")
    simulator.run_cell("C1", "=df.A.sum()")
    simulator.run_cell("C2", "=df.B.sum()")
    simulator.run_cell("C3", "=df.sum().sum()")
    simulator.run_cell("C4", "=A1:A3.to_dataframe().sum().sum()")
    simulator.run_cell("C5", "=A1:B1.to_dataframe(header=False).sum().iloc[0]")
    simulator.run_cell("C6", "=len(A1:B4.to_dataframe().dropna())")
    simulator.repl_command("import neptyne as nt; nt.sheets.new_sheet('NewSheet')")
    simulator.repl_command("NewSheet!A1=1")
    simulator.run_cell("C7", "=len(NewSheet.to_dataframe())")

    assert simulator.get("C1") == 3
    assert simulator.get("C2") == 4
    assert simulator.get("C3") == 7
    assert simulator.get("C4") == 3
    assert simulator.get("C5") == "AB"
    assert simulator.get("C6") == 1
    assert simulator.get("C7") == 1

    simulator.run_cell("Q1", '=[["Name", "Number", "Date"], ["Mies", 23, ""]]')

    simulator.run_cell("S2", "=DATE(2020, 10, 10)")

    simulator.run_cell("Q4", "=Q1:S2.to_dataframe()")

    assert simulator.get("R4") == "Name"
    assert simulator.get("Q5") == 1
    assert simulator.get("R5") == "Mies"
    assert simulator.get("T5").strftime("%Y-%m-%d") == "2020-10-10"

    simulator.restart()


def test_delete_cell_for_sum(simulator):
    simulator.run_cell("A1", "=SUM(B1:B3)")
    simulator.run_cell("B1", "1")
    simulator.run_cell("B2", "2")
    simulator.run_cell("B3", "1")

    assert simulator.get("A1") == 4
    simulator.run_cell("B2", "")
    assert simulator.get("A1") == 2


def test_import_csv(simulator):
    simulator.repl_command("import neptyne as nt")
    simulator.run_cell("A1", "=len(nt.sheets)")
    assert simulator.get("A1") == 1

    filename = "csv_sample.csv"
    parent_path = os.path.dirname(os.path.abspath(__file__))

    full_path = os.path.join(parent_path, "..", "import_test_data", filename)
    assert os.path.exists(full_path)
    sheet_name = os.path.splitext(filename)[0]
    simulator.repl_command(f"nt.sheets.sheet_from_csv({full_path!r},{sheet_name!r})")
    simulator.run_cell("A1", f"=nt.sheets[{sheet_name!r}].name")
    assert simulator.get("A1") == sheet_name

    # Import the same file again
    simulator.repl_command(f"nt.sheets.sheet_from_csv({full_path!r},{sheet_name!r})")
    simulator.run_cell("A1", "=len(nt.sheets)")
    assert simulator.get("A1") == 3

    sheet_name += "_1"
    simulator.run_cell("A1", f"=nt.sheets[{sheet_name!r}].name")
    assert simulator.get("A1") == sheet_name


def test_syntax_error(simulator):
    with pytest.raises(RuntimeError, match="SyntaxError: incomplete input"):
        simulator.repl_command("[")


def test_import_large_csv(simulator, tmp_path):
    ROW_COUNT = 1000
    simulator.repl_command("import neptyne as nt")
    sheet_name = "large_csv"
    filename = os.path.join(tmp_path, "large_csv.csv")
    with open(filename, "w") as f:
        f.write("a,b,c\n")
        for i in range(ROW_COUNT):
            f.write(f"h{i},{i},{i / ROW_COUNT}\n")
    simulator.repl_command(f"x = nt.sheets.sheet_from_csv({filename!r},{sheet_name!r})")
    simulator.run_cell("A1", f"=len({sheet_name}!A1:C)")
    assert simulator.get("A1") == ROW_COUNT + 1


@pytest.mark.parametrize(
    ("expression", "result"),
    [
        (
            "df",
            [
                ["A", "B", "C"],
                [1, 1, 1],
                [2, 4, 8],
                [3, 9, 27],
            ],
        ),
        (
            "df.set_index('B')",
            [
                ["B", "A", "C"],
                [1, 1, 1],
                [4, 2, 8],
                [9, 3, 27],
            ],
        ),
        (
            "df.sort_values('C', ascending=False)",
            [
                ["", "A", "B", "C"],
                [2, 3, 9, 27],
                [1, 2, 4, 8],
                [0, 1, 1, 1],
            ],
        ),
        (
            "df.sort_values('C', ascending=False).set_index('B')",
            [
                ["B", "A", "C"],
                [9, 3, 27],
                [4, 2, 8],
                [1, 1, 1],
            ],
        ),
        (
            "df.set_index(['A', 'B']).T",
            [
                ["A B", 1, "2 4", "3 9"],
                ["C", 1, 8, 27],
            ],
        ),
    ],
)
def test_dataframe_unroll(simulator, expression, result):
    simulator.repl_command("import pandas as pd")
    simulator.repl_command("A:Z.clear()")
    simulator.repl_command(
        "df = pd.DataFrame({'A': [1, 2, 3], 'B': [1, 4, 9], 'C': [1, 8, 27]})"
    )
    simulator.repl_command(f"A1 = {expression}")

    for rowix, row in enumerate(result):
        for colix, value in enumerate(row):
            addr = format_cell(colix, rowix)
            assert simulator.get(addr) == value, addr


def test_tick(simulator):
    def change_cell_attribute_message(cell_id, attr, val):
        updates = [
            CellAttributeUpdate(
                cell_id=[*parse_cell(cell_id), 0], attribute=attr, value=val
            )
        ]
        update = CellAttributesUpdate(updates=updates)
        return simulator.tyne_info.default_msg(
            simulator.simulator_session,
            MessageTypes.CHANGE_CELL_ATTRIBUTE.value,
            content=update.to_dict(),
        )

    simulator.repl_command("def increment(): B1 += 1; return 0")
    simulator.run_cell("A1", "=increment()")
    assert simulator.get("B1") == 1
    tyne_info = simulator.tyne_info
    with mock.patch("neptyne_kernel.dash.time.time") as mock_time:
        mock_time.return_value = 1654546543
        tyne_info.change_cell_attribute(
            change_cell_attribute_message(
                "A1", CellAttribute.EXECUTION_POLICY.value, "1"
            ),
        )

    simulator.wait_for_kernel()
    simulator.wait_for_kernel()
    assert simulator.get("B1") == 2


def test_graph_recomputation_from_set_range(simulator):
    simulator.run_cell("D1", "=SUM(C1:C2)")
    simulator.run_cell("A1", "=[[1, 2, 3], [4, 5, 6]]")
    assert simulator.get("A2") == 4
    assert simulator.get("D1") == 9
    simulator.run_cell("A1", "")
    assert not simulator.get("A2")
    assert simulator.get("D1") == 0

    # Spill assignment
    simulator.repl_command("A1 = [[1, 2, 3], [4, 5, 6]]")
    assert simulator.get("A2") == 4
    assert simulator.get("D1") == 9
    simulator.run_cell("A1", "")
    assert simulator.get("A2") == 4
    simulator.repl_command("A1:C3.clear()")
    assert simulator.get("D1") == 0

    # Range assignment
    simulator.repl_command("A1:C2 = [[1, 2, 3], [4, 5, 6]]")
    assert simulator.get("A2") == 4
    assert simulator.get("D1") == 9
    simulator.run_cell("A1", "")
    assert simulator.get("A2") == 4
    simulator.repl_command("A1:C3.clear()")
    assert simulator.get("D1") == 0


@pytest.fixture(scope="function")
def short_repl_limit():
    prior = tyne_content.MAX_REPL_HISTORY
    tyne_content.MAX_REPL_HISTORY = 5
    yield
    tyne_content.MAX_REPL_HISTORY = prior


def fake_is_repl_clear_cell(cell):
    # The simulator doesn't process streams correctly, so just mock the check
    return cell.raw_code == "clear"


@mock.patch(
    "server.tyne_content.is_repl_clear_cell",
    wraps=fake_is_repl_clear_cell,
)
def test_limit_save_history(_mock_is_clear, simulator, dbsession, short_repl_limit):
    for i in range(5):
        simulator.repl_command(str(i))
    simulator.repl_command("99")
    simulator.repl_command("clear")
    simulator.repl_command("100")
    simulator.repl_command("N_.save_state()")
    notebook = (
        dbsession.query(Notebook)
        .filter(Notebook.tyne_id == simulator.tyne_info.tyne_id)
        .one()
    )
    cells = notebook.contents
    assert len(cells) == 6  # code panel plus 2 repl commands
    assert not [*cells.values()][-4]["outputs"]
    assert len([*cells.values()][-2]["outputs"]) > 0


def test_on_value_change(simulator):
    simulator.set_code_pane(
        """
import neptyne as nt


@nt.on_value_change(A1:B10, H5.ref)
def color_if_value(cell):
    if cell:
        cell.set_background_color(255,0,0)
    else:
        cell.set_background_color(255,255,255)"""
    )

    simulator.run_cell("H5", "test")
    assert simulator.get_cell("H5").attributes["backgroundColor"] == "#FF0000"

    simulator.run_cell("H5", "")
    assert simulator.get_cell("H5").attributes["backgroundColor"] == "#FFFFFF"

    simulator.run_cell("A1", "=[[1, 2], [3, 4]]")

    assert simulator.get_cell("A1").attributes["backgroundColor"] == "#FF0000"
    assert simulator.get_cell("A2").attributes["backgroundColor"] == "#FF0000"
    assert simulator.get_cell("B1").attributes["backgroundColor"] == "#FF0000"
    assert simulator.get_cell("B2").attributes["backgroundColor"] == "#FF0000"

    simulator.run_cell("A1", "")
    assert simulator.get_cell("A1").attributes["backgroundColor"] == "#FFFFFF"
    assert simulator.get_cell("A2").attributes["backgroundColor"] == "#FFFFFF"
    assert simulator.get_cell("B1").attributes["backgroundColor"] == "#FFFFFF"
    assert simulator.get_cell("B2").attributes["backgroundColor"] == "#FFFFFF"

    simulator.repl_command("B5 = [3,4]")
    assert simulator.get_cell("B5").attributes["backgroundColor"] == "#FF0000"
    assert simulator.get_cell("B6").attributes["backgroundColor"] == "#FF0000"
    simulator.repl_command("B5.clear()")
    assert simulator.get_cell("B5").attributes["backgroundColor"] == "#FFFFFF"

    # Change the code and make sure it re-executes
    simulator.set_code_pane(
        """
import neptyne as nt


@nt.on_value_change(A1:B10, H5.ref)
def color_if_value(cell):
    if cell:
        cell.set_background_color(0,0,0)
    else:
        cell.set_background_color(0,0,0)"""
    )

    assert simulator.get_cell("B5").attributes["backgroundColor"] == "#000000"


def test_on_value_change_range(simulator):
    simulator.run_cell("A1", "5")

    simulator.set_code_pane(
        """
import neptyne as nt

@nt.on_range_change(A1:D4)
def testfn(r):
    r[0][1].set_background_color(r[0][0],r[0][0],r[0][0])
        """
    )

    assert simulator.get_cell("B1").attributes["backgroundColor"] == "#050505"
    simulator.run_cell("A1", "3")
    assert simulator.get_cell("B1").attributes["backgroundColor"] == "#030303"


def test_undo_attributes(simulator):
    undo = simulator.run_cell("A1", "1")
    assert simulator.get("A1") == 1
    simulator.undo(undo)
    assert not simulator.get("A1")

    undo = simulator.set_sheet_attribute(0, "attr", "value")
    assert simulator.get_sheet_attribute(0, "attr") == "value"
    simulator.undo(undo)
    with pytest.raises(KeyError):
        simulator.get_sheet_attribute(0, "attr")

    undo = simulator.set_cell_attribute(a1("A1"), "attr", "value")
    assert simulator.get_attribute(a1("A1"), "attr") == "value"
    simulator.undo(undo)
    assert not simulator.get_attribute(a1("A1"), "attr")


def test_capitalize_sheet_cells(simulator):
    simulator.run_cell("A1", "aaa")
    simulator.run_cell("B1", "='bbb'+a1")
    assert simulator.get("B1") == "bbbaaa"
    simulator.run_cell("A1", "ccc")
    assert simulator.get("B1") == "bbbccc"
    simulator.run_cell("C1", "=b1+a1")
    assert simulator.get("C1") == "bbbcccccc"
    # $-cells
    simulator.run_cell("A1", "aaa")
    simulator.run_cell("B1", "='bbb'+\n$a1")
    assert simulator.get("B1") == "bbbaaa"
    simulator.run_cell("B1", "='bbb'+$a$1")
    assert simulator.get("B1") == "bbbaaa"

    simulator.run_cell("A1", "=range(1, 4)")
    simulator.run_cell("B1", "=range(1, 4)")
    simulator.run_cell("C1", "=SUM(a1:a3)")
    assert simulator.get("C1") == 6
    simulator.run_cell("C1", "=SUM(a1:a2,a3,$b1:$b$3)")
    assert simulator.get("C1") == 12

    simulator.run_cell("A1", "=a2+max(top10(d1:e2),e1,f1)")
    result = simulator.get("A1")
    assert result.ename == "#NAME?"
    assert (
        result.msg
        == "name 'top10' is not defined\nDid you mean 'TOP10'? (Cell refs need to be upper case in Neptyne)"
    )


def test_store_data_types(simulator):
    simulator.repl_command("A1 = [[b'hello']]")
    assert simulator.get("A1") == b"hello"
    simulator.repl_command("B1 = [[{1,2,3}]]")
    assert simulator.get("B1") == {1, 2, 3}
    simulator.repl_command("C1 = [[{'a': 1}]]")
    assert simulator.get("C1") == {"a": 1}
    simulator.repl_command("D1 = [[[1, 2, 3]]]")
    assert simulator.get("D1") == [1, 2, 3]
    simulator.repl_command("import numpy as np")
    simulator.repl_command("E1 = np.array([1, 2, 3])")
    assert simulator.get("E1") == 1
    simulator.repl_command("F1 = [[np.array([1, 2, 3])]]")
    assert [*simulator.get("F1")] == [1, 2, 3]

    simulator.repl_command("A2:Q2.set_background_color(0, 0, 0)")
    simulator.repl_command("B2 = [[{1,2,3}]]")
    assert simulator.get("B2") == {1, 2, 3}
    simulator.repl_command("C2 = [[{'a': 1}]]")
    assert simulator.get("C2") == {"a": 1}
    simulator.repl_command("D2 = [[[1, 2, 3]]]")
    assert simulator.get("D2") == [1, 2, 3]
    simulator.repl_command("A2 = [[b'hello']]")
    assert simulator.get("A2") == b"hello"
    simulator.repl_command("E2 = np.array([1, 2, 3])")
    assert simulator.get("E2") == 1
    simulator.repl_command("F2 = [[np.array([1, 2, 3])]]")
    assert [*simulator.get("F2")] == [1, 2, 3]

    simulator.restart()

    assert simulator.get("A1") == b"hello"
    assert simulator.get("B1") == {1, 2, 3}
    assert simulator.get("C1") == {"a": 1}
    assert simulator.get("D1") == [1, 2, 3]
    assert simulator.get("E1") == 1
    assert [*simulator.get("F1")] == [1, 2, 3]

    assert simulator.get("A2") == b"hello"
    assert simulator.get("B2") == {1, 2, 3}
    assert simulator.get("C2") == {"a": 1}
    assert simulator.get("D2") == [1, 2, 3]
    assert simulator.get("E2") == 1
    assert [*simulator.get("F2")] == [1, 2, 3]


def test_has_raw_code_after_restart(simulator):
    simulator.repl_command("A1 = 1")
    simulator.restart()
    session_id = simulator.simulator_session.session

    save_msg = None

    def catch_save(msg):
        nonlocal save_msg
        save_msg = msg

    prev = simulator.tyne_proxy.send_tyne_state_to_client
    try:
        simulator.tyne_proxy.send_tyne_state_to_client = catch_save
        simulator.repl_command(f"N_.save_state({session_id!r})")
    finally:
        simulator.tyne_proxy.send_tyne_state_to_client = prev

    assert save_msg is not None
    NeptyneSessionInfo(session_id=session_id).write_to_header(
        save_msg[PARENT_HEADER_TAG]
    )
    simulator.tyne_proxy.send_tyne_state_to_client(save_msg)

    save_content = simulator.replies_to_client[-1][0]
    cell = save_content["sheets"][0]["cells"][0]

    assert len(cell) == 2 or cell[-1] == "1"


def test_recompile_everything(simulator):
    simulator.run_cell("A1", "=range(2)")
    assert simulator.get_dash().graph.calculated_by[a1("A2")] == a1("A1")
    simulator.get_dash().recompile_everything()
    assert simulator.get_dash().graph.calculated_by[a1("A2")] == a1("A1")


def test_return_none_clears_value(simulator):
    simulator.repl_command("def ident(x): return x")
    simulator.run_cell("A1", "=ident(1)")
    assert simulator.get("A1") == 1
    simulator.run_cell("A1", "=ident(None)")
    assert simulator.get("A1") is None


def test_clear_with_set_item(simulator):
    simulator.run_cell("A1", "1")
    simulator.run_cell("A2", "1")
    simulator.run_cell("A3", "1")
    simulator.run_cell("A4", "1")

    simulator.repl_command("A1 = None")
    simulator.repl_command("A2 = []")
    simulator.run_cell("A3", "=None")
    simulator.run_cell("A4", "=[]")

    assert not simulator.get("A1")
    assert not simulator.get("A2")
    assert not simulator.get("A3")
    assert not simulator.get("A4")

    assert len(simulator.get_dash().cells[0]) == 0


def test_iterate_infinite_range(simulator):
    simulator.set_code_pane(
        """
def iter_test():
    for v1, v2 in A1:B:
        C1 = 1"""
    )

    simulator.repl_command("iter_test()")
    assert not simulator.get("C1")

    simulator.run_cell("B1", "1")
    simulator.repl_command("iter_test()")
    assert simulator.get("C1") == 1

    simulator.run_cell("A1", "=len(F1:H)")
    assert simulator.get("A1") == 0

    simulator.run_cell("A2", "=len(F2:6)")
    assert simulator.get("A2") == 0


def test_dict_get_and_set_item_cell_range(simulator):
    with pytest.raises(RuntimeError):
        simulator.repl_command("A1['a'] = 1")

    with pytest.raises(RuntimeError):
        simulator.repl_command("A1:A5['a'] = 1")

    with pytest.raises(RuntimeError):
        simulator.repl_command("A1:A['a'] = 1")

    simulator.repl_command("A1:B['key_a'] = 1")
    simulator.repl_command("Sheet0['key_b'] = [1,2,3,4]")

    assert simulator.get("A1") == "key_a"
    assert simulator.get("A2") == "key_b"
    assert simulator.get("B1") == 1
    assert simulator.get("B2") == [1, 2, 3, 4]

    simulator.repl_command("A1:B5['key_a'] = 'test'")
    simulator.repl_command("Sheet0['key_b'] = [[1,2,3],[4,5,6]]")
    assert simulator.get("B1") == "test"
    assert simulator.get("B2") == [[1, 2, 3], [4, 5, 6]]

    simulator.repl_command("del A1:B['key_a']")

    assert simulator.get("A1") == "key_b"
    assert simulator.get("B1") == [[1, 2, 3], [4, 5, 6]]


@pytest.mark.parametrize(
    ("args"),
    [
        {
            "name": "Capitalized cell name",
            "code": "x=Player1",
            "error": "NameError: name 'Player1' is not defined\nDid you mean 'PLAYER1'?",
        },
        {
            "name": "Column with $",
            "code": "x=$Player1",
            "error": "x=PLAYER1\n\nIndexError: Neptyne currently only supports 700 columns",
        },
        {
            "name": "Row with $",
            "code": "x=a$1",
            "error": "SyntaxError: invalid syntax\nDid you mean 'A$1'?",
        },
        {
            "name": "Range lower case",
            "code": "x=a1:player22",
            "error": "SyntaxError: invalid syntax\nDid you mean 'A1:PLAYER22'?",
        },
        {
            "name": "Range start column with $",
            "code": "x=$Player1:player22",
            "error": "x=PLAYER1:player22\n             ^\nSyntaxError: invalid syntax",
        },
        {
            "name": "Range start row with $",
            "code": "x=Player$1:player22",
            "error": "SyntaxError: invalid syntax\nDid you mean 'PLAYER$1:PLAYER22'?",
        },
        {
            "name": "Range end column with $",
            "code": "x=Player1:$player22",
            "error": "SyntaxError: invalid syntax\nDid you mean 'PLAYER1:PLAYER22'? (Cell refs need to be upper case in Neptyne)",
        },
        {
            "name": "Range end row with $",
            "code": "x=Player1:player$22",
            "error": "SyntaxError: invalid syntax\nDid you mean 'PLAYER1:PLAYER$22'?",
        },
        {
            "name": "Range start with $",
            "code": "x=$Player$11:player22",
            "error": "x=PLAYER11:player22\n              ^\nSyntaxError: invalid syntax",
        },
        {
            "name": "Range end with $",
            "code": "x=Player1:$player$22",
            "error": "SyntaxError: invalid syntax\nDid you mean 'PLAYER1:PLAYER22'? (Cell refs need to be upper case in Neptyne)",
        },
        {
            "name": "Range with $",
            "code": "x=$Player$1:$player$22",
            # TODO: Fix stack trace error from deep within ipython
            # "error": "x =PLAYER1:PLAYER22\n\nIndexError: Neptyne currently only supports 700 columns",
            "error": "\n\nIndexError: Neptyne currently only supports 700 columns",
        },
        {
            "name": "Range partial start column",
            "code": "x=a:c777",
            "error": "SyntaxError: invalid syntax\nDid you mean 'A:C777'?",
        },
        {
            "name": "Range partial end column",
            "code": "x=a1:c",
            "error": "SyntaxError: invalid syntax\nDid you mean 'A1:C'?",
        },
        {
            "name": "Range partial",
            "code": "x=start:end",
            "error": "SyntaxError: invalid syntax\nDid you mean 'START:END'?",
        },
        {
            "name": "Range partial with $",
            "code": "x=$Start:$end",
            # "error": "x =END1:START1\n\nIndexError: Neptyne currently only supports 700 columns",
            "error": "\n\nIndexError: Neptyne currently only supports 700 columns",
        },
        {
            "name": "Don't show the hint",
            "code": "x = 800 d + A1",
            "error": "SyntaxError: invalid syntax",
        },
    ],
)
def test_range_error_scenarios(
    simulator,
    args,
):
    try:
        simulator.repl_command(args["code"])
        assert False
    except Exception as e:
        assert args["error"] in str(e)


@pytest.mark.parametrize("op", ["/", "//"])
def test_div_empty_by_zero(simulator, op):
    simulator.run_cell("A1", f"=B1{op}0")
    assert simulator.get("A1") == ZERO_DIV_ERROR

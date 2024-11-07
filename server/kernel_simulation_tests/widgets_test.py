from unittest import mock

from neptyne_kernel.neptyne_protocol import CellAttribute
from neptyne_kernel.spreadsheet_error import SpreadsheetError
from neptyne_kernel.widgets.output_widgets import maybe_render_widget


def test_widget_get_state(simulator):
    simulator.run_cell("A1", "=range(3)")
    simulator.run_cell("B1", "=Pie(A1:A3)")
    simulator.get_widget_state(
        "B1",
        {"data": "A1:A3", "labels": [], "donut": False, "title": ""},
    )
    simulator.run_cell("C1", "=Button('asdf')")
    simulator.get_widget_state(
        "C1", {"caption": "asdf", "disabled": False, "is_spinning": False}
    )
    simulator.run_cell("D1", "=Button(\"'asdf'\")")
    simulator.get_widget_state(
        "D1", {"caption": "'asdf'", "disabled": False, "is_spinning": False}
    )


def test_validate_widget_params(simulator):
    simulator.run_cell("A1", "=range(3)")
    simulator.run_cell("A1", "=range(3)")
    simulator.validate_widget_params("=Pie(data=A1:A3)", {"data": "A1:A3"}, {})
    simulator.validate_widget_params("=Pie(data=7)", {"data": "7"}, {"data"})
    simulator.validate_widget_params(
        "=Scatter(x=[1,2,3],y=[1,2])", {"x": "[1,2,3]", "y": "[1,2]"}, {"x", "y"}
    )


def test_widget_color_params(simulator):
    simulator.run_cell("A1", "=Button()")
    assert simulator.get("A1").background_color is None

    simulator.run_cell("B1", "=Button(background_color=Color('#FF0000'))")
    assert simulator.get("B1").background_color == "#FF0000"

    simulator.run_cell("C1", "=Button(background_color='#FF0000')")
    assert simulator.get("C1").background_color == "#FF0000"


@mock.patch("neptyne_kernel.kernel_runtime.get_ipython_mockable", mock.MagicMock())
def test_widgets(simulator):
    simulator.repl_command("def slide(val): A2=val")
    simulator.run_cell("A1", "=Slider(slide, 10.0)")
    simulator.run_cell("B1", "=A1.value")
    assert simulator.get("B1") == 10.0

    simulator.repl_command("def click(event): C1=sum(event.cell.xy)")
    button_create = "=Button('click me', click)"
    simulator.run_cell("D1", button_create)
    assert simulator.get("D1").caption == "click me"
    simulator.repl_command("D1.caption = 'click me again'")
    simulator.restart()
    assert simulator.get("D1").caption == "click me again"
    assert simulator.get_cell("D1").raw_code == button_create
    simulator.run_cell("C2", "=C1")
    simulator.trigger_widget_event("D1")
    assert simulator.get("C1") == 3
    assert simulator.get("D1").caption == "click me"

    simulator.repl_command("E1.value = False")

    # The below fails when we run this test in a batch with other tests:
    # assert simulator.get("E2") == "False"

    simulator.repl_command("E1.set_background_color(255, 255, 0)")
    assert (
        simulator.get_attribute("E1", CellAttribute.BACKGROUND_COLOR.value) == "#FFFF00"
    )

    simulator.repl_command("def select(val, event): F3=val * sum(event.cell.xy)")
    simulator.run_cell("F5", "=['a', 'b', 'c']")
    simulator.run_cell("F1", "=Dropdown(F5:F7, select)")
    simulator.run_cell("F2", "=F1.value * 2")
    simulator.trigger_widget_event("F1", "b")
    assert simulator.get("F2") == "bb"
    assert simulator.get("F3") == "bbbbb"

    simulator.run_cell("G1", "=range(1, 6)")
    simulator.run_cell("H1", "=Dropdown(G1:G5)")
    simulator.run_cell("I1", "=H1.value")
    assert simulator.get("I1") == 1

    simulator.run_cell("J1", "=Button(caption=\"'asdf'\")")
    assert simulator.get("J1").caption == "'asdf'"


@mock.patch("neptyne_kernel.kernel_runtime.get_ipython_mockable", mock.MagicMock())
def test_widgets_with_on_value_change(simulator):
    simulator.set_code_pane(
        """
import neptyne as nt


@nt.on_value_change(A1:B10)
def color_if_value(cell):
    if cell:
        cell.set_background_color(255,0,0)
    else:
        cell.set_background_color(255,255,255)

def handler():
    A1 = 'asdf'"""
    )

    simulator.run_cell("C1", "=Button(handler)")
    simulator.trigger_widget_event("C1")
    assert (
        simulator.get_attribute("A1", CellAttribute.BACKGROUND_COLOR.value) == "#FF0000"
    )


@mock.patch("neptyne_kernel.kernel_runtime.get_ipython_mockable", mock.MagicMock())
def test_check_box(simulator):
    simulator.run_cell("A1", "=Checkbox()")
    simulator.run_cell("B1", "=A1.value")
    assert simulator.get("B1") is False
    simulator.trigger_widget_event("A1", True)
    assert simulator.get("B1") is True

    simulator.repl_command("def check(val): E2=str(E1.value)")
    checkbox_create = "=Checkbox(check, False)"
    simulator.run_cell("E1", checkbox_create)
    simulator.trigger_widget_event("E1", True)
    assert simulator.get("E2") == "True"
    e1 = simulator.get("E1")
    assert e1.value
    simulator.restart()
    assert simulator.get_cell("E1").raw_code == checkbox_create
    simulator.trigger_widget_event("E1", False)
    assert simulator.get("E1").value is False
    simulator.trigger_widget_event("E1", True)
    assert simulator.get("E1").value is True


def test_output_widget_init(simulator):
    simulator.run_cell("A1", "=Scatter(x=[1.3,2,3],y=[4,5.1,6])")
    assert len(simulator.get("A1").x) == 3

    simulator.run_cell("A2", "=Line(y=[[1,2.5,3],[4,5,6.8]])")
    assert len(simulator.get("A2").y) == 2

    simulator.run_cell("A3", "=Column(x=['a','b'], y=[[1,2.2],[3,4]])")
    assert len(simulator.get("A3").x) == 2

    simulator.run_cell("A4", "=Bar(x=[1, 2.2], y=[3.3,4])")
    assert len(simulator.get("A4").x) == 2

    simulator.run_cell(
        "A5", "=TreeMap(data=[1,2,3.5],level1=['a','b','c'],level2=['d','e','f'])"
    )
    assert len(simulator.get("A5").data) == 3

    simulator.run_cell(
        "A6",
        "=Map(latitudes=[1,2.3,3], longitudes=[4.2,5,6])",
    )
    assert len(simulator.get("A6").latitudes) == 3

    simulator.run_cell("A7", "=Markdown(text='#hello')")
    assert simulator.get("A7").text == "#hello"

    simulator.run_cell("A8", "=Pie([1,2.8,3])")
    assert len(simulator.get("A8").data) == 3

    # Test forgiveness from primitive param forgiveness + cell range
    simulator.run_cell("B1", "=range(3)")
    simulator.run_cell(
        "A9",
        "=Map(latitudes=B1:B3, longitudes=[4,5,6], default_radius=100)",
    )
    assert len(simulator.get("A9").latitudes) == 3
    assert simulator.get("A9").default_radius == 100.0

    # Repr strings
    simulator.run_cell(
        "A11",
        "=Scatter([1,2,3], [4,5,6], title=80)",
    )
    assert simulator.get("A11").title == "80"


def test_output_widgets_with_cell_range(simulator):
    simulator.run_cell("A1", "=range(3)")
    simulator.run_cell("B1", "=range(3)")
    simulator.run_cell("C1", "=Pie(A1:A3)")
    assert len(simulator.get("C1").data) == 3

    simulator.run_cell(
        "D1", "=Scatter(x=A1:A3, y=B1:B3, radius=A1:A3, hover_labels=B1:B3)"
    )
    assert len(simulator.get("D1").x) == 3

    simulator.run_cell("E1", "=Line(A1:A3, B1:B3)")
    assert len(simulator.get("E1").x) == 3

    simulator.run_cell("F1", "=Column(A1:A3, B1:B3)")
    assert len(simulator.get("F1").x) == 3

    simulator.run_cell("G1", "=Bar(A1:A3, B1:B3)")
    assert len(simulator.get("G1").x) == 3

    simulator.run_cell(
        "I1",
        "=Map(latitudes=A1:A3, longitudes=B1:B3, labels=A1:A3, hover_labels=B1:B3, radius=A1:A3)",
    )
    assert len(simulator.get("I1").latitudes) == 3


def test_widget_validator(simulator):
    # Caption does not match Optional[list[str]] and should crash.
    simulator.run_cell(
        "A1",
        "=Map(latitudes=[1,2,3], longitudes=[4,5,6], caption=100)",
    )
    assert isinstance(simulator.get("A1"), SpreadsheetError)

    # Mismatching lengths should crash
    simulator.run_cell(
        "A2",
        "=Scatter(x=[1,3], y=[4,5,6])",
    )
    assert isinstance(simulator.get("A2"), SpreadsheetError)

    # Not a dictionary type
    simulator.run_cell("A3", "=Scatter(x=[1,2,3], y=[4,5,6], kwargs=[1,2])")
    assert isinstance(simulator.get("A3"), SpreadsheetError)


def test_cascading_button_update(simulator):
    simulator.repl_command(
        "def click(event):\n"
        "    count = int(event.cell.caption) + 1\n"
        "    A1 = f\"=Button('{count}', click)\"",
    )
    simulator.run_cell("A1", "=Button('0', click)")
    for i in range(11):
        simulator.trigger_widget_event("A1")
        assert simulator.get("A1").caption == str(i + 1)


def test_empty_in_dropdown(simulator):
    simulator.run_cell("A1", "=Dropdown(B1:B4)")
    assert simulator.get("A1").value.is_empty()


def test_non_primitive_in_dropdown(simulator):
    simulator.run_cell("A1", "=Dropdown([print, 1, 2, 3])")
    assert isinstance(simulator.get("A1"), SpreadsheetError)


def test_floats_are_valid(simulator):
    simulator.run_cell("A1", "=[x/10 for x in range(10)]")
    simulator.run_cell("B2", "=Pie(A1:A10)")
    maybe_render_widget(simulator.get("B2"), {})

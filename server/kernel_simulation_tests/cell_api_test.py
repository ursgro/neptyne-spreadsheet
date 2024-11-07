import pytest

from neptyne_kernel.cell_address import parse_cell
from neptyne_kernel.neptyne_protocol import (
    CellAttribute,
    CellAttributesUpdate,
    CellAttributeUpdate,
    MessageTypes,
)
from neptyne_kernel.test_utils import a1
from neptyne_kernel.widgets.color import Color
from neptyne_kernel.widgets.output_widgets import (
    DEFAULT_OUTPUT_WIDGET_HEIGHT,
    DEFAULT_OUTPUT_WIDGET_WIDTH,
)


def test_value_format(simulator):
    simulator.run_cell("A1", "=10 + 10")
    assert simulator.get_attribute("A1", CellAttribute.NUMBER_FORMAT.value) is None
    simulator.run_cell("A2", "=TODAY()")
    assert simulator.get_attribute("A2", CellAttribute.NUMBER_FORMAT.value).startswith(
        "date"
    )
    simulator.repl_command("def a(x:int): return x")
    simulator.run_cell("A3", "=a")
    assert simulator.get("A3") == "<function a>"


def test_clear(simulator):
    simulator.run_cell("A1", "=1")
    simulator.repl_command("A1.clear()")
    assert simulator.get("A1") is None
    assert simulator.get_cell("A1").raw_code == ""

    simulator.run_cell("A1", "1")
    simulator.repl_command("A1.clear()")
    assert simulator.get("A1") is None

    simulator.repl_command("A1=[[ch1 + ch2 for ch1 in 'abc'] for ch2 in '123']")
    assert simulator.get("B2") == "b2"
    simulator.repl_command("B2:B.clear()")
    assert simulator.get("B1") == "b1"
    assert simulator.get("B2") is None


def test_to_datetime(simulator):
    simulator.run_cell("A1", "=TODAY()")
    assert simulator.get("A1") > 44968
    simulator.run_cell("B1", "44968")
    simulator.run_cell("C1", "=B1.to_datetime().strftime('%Y-%m')")
    assert simulator.get("C1") == "2023-02"

    simulator.run_cell("D1", "44968.2")
    simulator.run_cell("E1", "=D1.to_datetime().strftime('%Y-%m')")
    assert simulator.get("E1") == "2023-02"


def test_cell_attribute(simulator):
    simulator.repl_command("A1=range(10)")
    simulator.repl_command("A1.set_color(255, 0, 127)")
    assert simulator.get("A1") == 0
    assert simulator.get_attribute("A1", CellAttribute.COLOR.value) == "#FF007F"

    simulator.repl_command("A2.set_text_style('bold')")
    assert simulator.get_attribute("A2", CellAttribute.TEXT_STYLE.value) == "bold"

    simulator.repl_command("Q10:R11.set_background_color(255, 255, 0)")
    assert (
        simulator.get_attribute("R10", CellAttribute.BACKGROUND_COLOR.value)
        == "#FFFF00"
    )

    simulator.run_cell("W5", "=COT(0)")
    simulator.repl_command("W5.set_link('https://neptyne.com')")
    assert (
        simulator.get_attribute("W5", CellAttribute.LINK.value) == "https://neptyne.com"
    )

    simulator.repl_command("A3.set_text_align('right')")
    assert simulator.get_dash()[a1("A3")].get_text_align() == "right"

    simulator.repl_command("A4.set_number_format('date', 'yyyy-mm-dd')")
    assert (
        simulator.get_attribute("A4", CellAttribute.NUMBER_FORMAT.value)
        == "date-yyyy-mm-dd"
    )

    simulator.repl_command("A4.set_border({'border-bottom', 'border-left'})")
    borders = {*simulator.get_attribute("A4", CellAttribute.BORDER.value).split(" ")}
    assert borders == {"border-bottom", "border-left"}

    simulator.repl_command("A5.set_line_wrap('overflow')")
    assert simulator.get_attribute("A5", CellAttribute.LINE_WRAP.value) == "overflow"


def test_range_attributes(simulator):
    simulator.repl_command("A1:Z1.set_text_style('bold')")
    assert simulator.get_attribute("A1", CellAttribute.TEXT_STYLE.value) == "bold"

    simulator.repl_command("r = B2:B4")
    simulator.repl_command("r[0].set_text_style('bold')")
    assert simulator.get_attribute("B2", CellAttribute.TEXT_STYLE.value) == "bold"

    simulator.repl_command("r = B2:F10")
    simulator.repl_command("r[1:3, 1:5].set_background_color(200, 100, 100)")
    assert (
        simulator.get_attribute("E4", CellAttribute.BACKGROUND_COLOR.value) == "#C86464"
    )


def test_no_invalid_attributes(simulator):
    simulator.run_cell("A1", "=Button()")
    simulator.repl_command("A1.caption = 'Hello'")
    assert simulator.get("A1").caption == "Hello"

    with pytest.raises(RuntimeError):
        simulator.repl_command("A2.caption = 'hello'")

    with pytest.raises(RuntimeError):
        simulator.repl_command("A1.catpion = 'hello'")

    simulator.run_cell("A3", "1")
    with pytest.raises(RuntimeError):
        simulator.repl_command("A3.caption = 'hello'")


def test_cell_attributes(simulator):
    def change_cell_attribute_message(cell_id, attr, val):
        updates = [
            CellAttributeUpdate(
                cell_id=[0, *parse_cell(cell_id)], attribute=attr, value=val
            )
        ]
        update = CellAttributesUpdate(updates=updates)
        return simulator.tyne_info.default_msg(
            simulator.simulator_session,
            MessageTypes.CHANGE_CELL_ATTRIBUTE.value,
            content=update.to_dict(),
        )

    simulator.run_cell("A1", "hello")
    tyne_info = simulator.tyne_info
    tyne_info.change_cell_attribute(
        change_cell_attribute_message("A1", CellAttribute.COLOR.value, "#FF00FF"),
    )
    simulator.run_cell("Z1", "flush")
    assert simulator.get("A1") == "hello"
    assert simulator.get_attribute("A1", CellAttribute.COLOR.value) == "#FF00FF"
    tyne_info.change_cell_attribute(
        change_cell_attribute_message("A1", CellAttribute.EXECUTION_POLICY.value, "10"),
    )
    assert simulator.get_cell("A1").execution_policy == 10


@pytest.mark.parametrize(
    "cell_range, bg_color, cell_to_check",
    [
        ("A1:2", [0, 255, 0], "AA1"),
        ("1:2", [0, 255, 255], "BB1"),
        ("A1: B", [255, 0, 0], "A1001"),
        ("A: B", [255, 255, 0], "B1001"),
    ],
)
def test_cell_attributes_for_infinite_ranges(
    simulator, cell_range, bg_color, cell_to_check
):
    simulator.run_cell(cell_to_check, "1")
    simulator.repl_command(f"{cell_range}.set_background_color{tuple(bg_color)}")
    assert (
        simulator.get_cell(cell_to_check).attributes["backgroundColor"]
        == Color(*bg_color).webcolor
    )


def test_meta_has_raw_code_after_attributes(simulator):
    simulator.repl_command("A1 = 1")
    simulator.repl_command("A1.set_background_color(0, 0, 0)")
    assert simulator.get_dash().get_raw_code(a1("A1")) == "1"


def test_cell_attributes_get(simulator):
    simulator.run_cell("A1", "1")
    simulator.repl_command("A1.set_background_color(0, 240, 0)")
    assert simulator.get_dash()[a1("A1")].get_background_color() == (0, 240, 0)
    simulator.repl_command("A2.set_background_color(0, 40, 0)")
    assert simulator.get_dash()[a1("A1:A2")].get_background_color() == [
        (0, 240, 0),
        (0, 40, 0),
    ]
    assert simulator.get_dash()[a1("A1:B2")].get_background_color() == [
        [(0, 240, 0), None],
        [(0, 40, 0), None],
    ]

    simulator.repl_command("E1.set_text_style('bold')")
    assert simulator.get_dash()[a1("E1")].get_text_style() == {"bold"}
    simulator.repl_command("E2.set_text_style({'italic', 'bold'})")
    assert simulator.get_dash()[a1("E1:E2")].get_text_style() == [
        {"bold"},
        {"italic", "bold"},
    ]

    simulator.repl_command("F1.set_col_span(2)")
    assert simulator.get_dash()[a1("F1")].get_col_span() == 2

    simulator.repl_command("G1.set_render_size(100, 200)")
    assert simulator.get_dash()[a1("G1")].get_render_size() == (100, 200)


def test_custom_number_format(simulator):
    simulator.repl_command("A1.set_custom_number_format('0.00')")
    assert simulator.get_dash()[a1("A1")].get_custom_number_format() == "0.00"
    assert simulator.get_dash()[a1("D1:D2")].get_custom_number_format() == [None, None]


def test_render_size(simulator):
    simulator.repl_command("A1.set_render_size(100, 200)")
    assert simulator.get_dash()[a1("A1")].get_render_size() == (100, 200)
    assert simulator.get_dash()[a1("D1:D2")].get_render_size() == [
        (DEFAULT_OUTPUT_WIDGET_WIDTH, DEFAULT_OUTPUT_WIDGET_HEIGHT),
        (DEFAULT_OUTPUT_WIDGET_WIDTH, DEFAULT_OUTPUT_WIDGET_HEIGHT),
    ]


def test_sort_rows(simulator):
    simulator.repl_command("A1 = [[1, 'a'], [5, 'q'], [6, 'b'], [0, 'b']]")

    simulator.repl_command("A1:B4.sort_rows([1,0])")
    assert simulator.get("A1") == 1
    assert simulator.get("A2") == 0
    assert simulator.get("A3") == 6
    assert simulator.get("A4") == 5

    simulator.repl_command("A1:B4.sort_rows(0)")
    assert simulator.get("A1") == 0
    assert simulator.get("A2") == 1
    assert simulator.get("A3") == 5
    assert simulator.get("A4") == 6

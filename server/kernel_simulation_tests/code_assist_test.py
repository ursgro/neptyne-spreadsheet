"""These tests shouldn't be run in CI, but they can be run locally to check the results."""

import re
from unittest import mock

from neptyne_kernel.tyne_model.table_for_ai import TableForAI
from server.codeassist import (
    ReplCodeAssistReply,
)
from server.codeassist import (
    repl_code_assist as repl_code_assist_orig,
)

# noinspection PyUnresolvedReferences
from server.kernel_simulation_tests.kernel_simulator import (
    Simulator,
)


def code_assist(simulator: Simulator, prompt: str, active_sheet: str = "Sheet0"):
    code_pane = simulator.get_code_pane()
    simulator.repl_command(prompt, for_ai=True)
    existing_lines = {*code_pane.splitlines()}
    return [
        line
        for line in simulator.get_code_pane().splitlines()
        if line not in existing_lines
    ]


STOCK_REPLIES = {
    "Write a function to aggregate the billings by customer": ReplCodeAssistReply(
        (
            "import pandas as pd\n"
            "\n"
            "def aggregate_billings(df):\n"
            '    return df.groupby("Customer")["Billings"].sum().reset_index()'
        ),
    ),
    "Insert a map of the cities into B8": ReplCodeAssistReply(
        (
            "import plotly.express as px\n"
            "\n"
            "\n"
            "def city_map(df):\n"
            '    fig = px.scatter_mapbox(df, lat="Lat", lon="Lng", hover_name="City", zoom=10)\n'
            '    fig.update_layout(mapbox_style="open-street-map")\n'
            "    return fig"
        ),
        cells_to_update=[("Sheet0!B8", "=city_map('Sheet0'!A1:C5.to_dataframe())")],
    ),
    "put a list of the most popular museums in the world into A1": ReplCodeAssistReply(
        (
            "import pandas as pd\n"
            "\n"
            "\n"
            "def popular_museums():\n"
            '    url = "https://en.wikipedia.org/wiki/List_of_most_visited_museums"\n'
            "    return pd.read_html(url)[0]"
        ),
        cells_to_update=[("Sheet0!A1", "=popular_museums()")],
    ),
    "insert a map of the museums into B2": ReplCodeAssistReply(
        (
            "import plotly.express as px\n\n\n"
            "def museum_map(df):\n"
            '    fig = px.scatter_mapbox(df, lat="lat", lon="lng", hover_name="Name", '
            'hover_data=["Location", "Number of visitors"], zoom=3, height=500)\n'
            '    fig.update_layout(mapbox_style="open-street-map")\n'
            "    return fig"
        ),
        cells_to_update=[("Sheet0!B2", "=museum_map(popular_museums())")],
    ),
}


async def repl_code_assist(
    prompt: str,
    prev_code_pane: str,
    ai_tables: list[TableForAI],
    current_sheet_name: str,
    history: list[dict] | None = None,
    gs_mode: bool | None = None,
) -> ReplCodeAssistReply:
    stock_reply = STOCK_REPLIES.get(prompt)
    if stock_reply:
        return stock_reply
    res = await repl_code_assist_orig(
        prompt, prev_code_pane, ai_tables, current_sheet_name, history
    )
    return res


def name_of_added_function(lines: list[str]) -> str | None:
    for line in lines:
        m = re.match(r"def (\w+)", line)
        if m:
            return m.group(1)
    return None


# @pytest.mark.skip(reason="Magic is not reproducible")
@mock.patch("server.tyne_info.repl_code_assist", repl_code_assist)
def test_billing(simulator):
    hours = [
        ["Customer", "Person", "Hours", "Rate", "Billings"],
        ["Cityhall", "Colleen Coder", 35, 140, 4900],
        ["Startup", "Arnie Admin", 10, 120, 1200],
        ["Cityhall", "Max Manager", 12, 160, 1920],
        ["Big Industry", "Colleen Coder", 25, 180, 4500],
        ["Startup", "Arnie Admin", 15, 120, 1800],
        ["Big Industry", "Max Manager", 7, 200, 1400],
        ["Cityhall", "Max Manager", 11, 160, 1760],
        ["Big Industry", "Arnie Admin", 11, 140, 1540],
        ["Startup", "Colleen Coder", 17, 120, 2040],
    ]
    customers = [
        ["Customer", "Email", "City", "State"],
        ["Cityhall", "info@cityhall.nyc", "Manhattan", "New York"],
        ["Startup", "hello@startup.co", "San Francisco", "California"],
        ["Big Industry", "big@mail.industry.com", "Columbus", "Ohio"],
    ]
    simulator.repl_command(f"B1={hours!r}")
    simulator.repl_command("import neptyne as nt")
    simulator.repl_command("nt.sheets.new_sheet('Customers')")
    simulator.repl_command(f"Customers!B1={customers!r}")

    assert simulator.get("B1") == "Customer"
    assert simulator.get("Customers!B1") == "Customer"

    added_lines = code_assist(
        simulator,
        "Write a function to aggregate the billings by customer",
    )
    billing_fn = name_of_added_function(added_lines)
    assert billing_fn == "aggregate_billings"
    #
    # simulator.repl_command(f"B13={billing_fn}()")
    #
    # assert simulator.get("C14") == 7440
    #
    # added_lines = code_assist(
    #     simulator,
    #     CodexHelpCategory.CREATE_REPORTS.value,
    #     "Combine the billings with the customer information",
    # )
    # combine_fn = name_of_added_function(added_lines)
    # assert combine_fn
    #
    # simulator.repl_command(f"A18={combine_fn}()")
    # assert simulator.get("D19") == "big@mail.industry.com"
    #
    # code_assist(
    #     simulator,
    #     CodexHelpCategory.VISUALIZE_DATA.value,
    #     "insert a pie chart into I2 with the billings per customer",
    # )
    #
    # assert OutputWidget.mime_type.value in simulator.get_cell("I2").outputs[0].data
    #
    # simulator.run_cell("C18", "Amount due")
    #
    # added_lines = code_assist(
    #     simulator,
    #     CodexHelpCategory.IMPORT_DATA.value,
    #     "go through the customers and their emails and send each their amount due",
    # )
    # send_email_fn = name_of_added_function(added_lines)
    # assert "email" in send_email_fn
    # assert "B18:F21" in "\n".join(added_lines)


@mock.patch("server.tyne_info.repl_code_assist", repl_code_assist)
def test_map(simulator):
    cities = [
        ["City", "Lat", "Lng"],
        ["Berlin", 52.53, 13.4],
        ["Amsterdam", 52.37, 4.9],
        ["Paris", 48.85, 2.35],
        ["Rome", 41.9, 12.5],
    ]
    simulator.repl_command(f"A1={cities!r}")
    code_assist(
        simulator,
        "Insert a map of the cities into B8",
    )
    assert "mapbox" in simulator.get_cell("B8").output.data["text/html"]


@mock.patch("server.tyne_info.repl_code_assist", repl_code_assist)
def test_museums(simulator):
    added_lines = code_assist(
        simulator,
        "put a list of the most popular museums in the world into A1",
    )
    for line in added_lines:
        if "pd.read_html(" in line:
            break
    else:
        raise AssertionError("No call to pd.read_html found")

    code_assist(simulator, "insert a map of the museums into B2")

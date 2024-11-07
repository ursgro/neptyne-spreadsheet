import csv
import os
from io import BytesIO, StringIO

import openpyxl
import pytest
from google.auth.credentials import AnonymousCredentials
from gspread.exceptions import APIError
from tornado.web import HTTPError

from neptyne_kernel.cell_address import Address
from neptyne_kernel.neptyne_protocol import AccessLevel as ClientAccessLevel
from neptyne_kernel.neptyne_protocol import (
    AccessScope,
    ShareRecord,
    TyneShareResponse,
)
from neptyne_kernel.tyne_model.cell import NotebookCell, SheetCell
from neptyne_kernel.tyne_model.jupyter_notebook import OutputType
from server.tyne_content import (
    CLEAR_BYTE_STRING,
    TyneContent,
    export_tyne_model,
    tyne_sheets_from_orm_model,
)

from .conftest import mock_user
from .models import AccessLevel, FirebaseUser, TyneOwner, User
from .tyne_contents_manager import get_tyne_access_level
from .tyne_import import OPENPYXL_COL_PIXELS_PER_UNIT


@pytest.mark.asyncio
async def test_import_notebook(tyne_contents_manager, dbsession):
    cell_ix = 0

    def make_cell(source, outputs):
        nonlocal cell_ix
        cell_ix += 1
        return {
            "execution_count": None,
            "id": f"{cell_ix-1:02}",
            "metadata": {},
            "outputs": outputs,
            "source": [source],
            "cell_type": "code",
        }

    def stream_stdout(text):
        return {"output_type": "stream", "text": [text], "name": "stdout"}

    code_panel_code = 'A1 = "Neptyne"'
    hello_world_code = 'print("Hello, world!")'
    NOTEBOOK = {
        "cells": [
            make_cell(code_panel_code, []),
            make_cell('print("clear me")', [stream_stdout("clear me")]),
            make_cell("clear", [stream_stdout(CLEAR_BYTE_STRING)]),
            make_cell(hello_world_code, [stream_stdout("Hello, world!")]),
        ],
        "nbformat": 4,
        "nbformat_minor": 5,
        "metadata": {},
    }

    user = mock_user()

    tyne = await tyne_contents_manager.import_notebook_ipynb(
        dbsession, NOTEBOOK, "neptyne", user
    )
    notebook_cells = tyne.tyne_content.notebook_cells

    assert len(notebook_cells) == 2
    assert code_panel_code in notebook_cells[0].raw_code
    assert hello_world_code in notebook_cells[-1].raw_code


@pytest.mark.asyncio
async def test_sharing(tyne_contents_manager, dbsession):
    user = mock_user()

    tyne_1 = (await tyne_contents_manager.new_tyne(dbsession, user)).tyne_model
    tyne_2 = (await tyne_contents_manager.new_tyne(dbsession, user)).tyne_model
    tyne_3 = (await tyne_contents_manager.new_tyne(dbsession, user)).tyne_model

    share_with = User(
        firebase_users=[FirebaseUser(firebase_uid="firebase_user.uid")],
        name="User",
        email="user@neptyne.com",
    )

    share_with.tyne_owner = TyneOwner(handle=share_with.email)
    dbsession.add(share_with)

    tyne_4 = (await tyne_contents_manager.new_tyne(dbsession, share_with)).tyne_model

    # Share to 1 user
    tyne_contents_manager.share_tyne(
        await tyne_contents_manager.load_tyne_model(tyne_1.file_name, dbsession, user),
        dbsession,
        TyneShareResponse(
            description="a share",
            is_app=False,
            shares=[
                ShareRecord(
                    access_level=ClientAccessLevel.EDIT,
                    email=share_with.email,
                    name=None,
                )
            ],
            users=[],
            general_access_level=None,
            general_access_scope=None,
            share_message=None,
            team_name=None,
        ),
    )

    # publish
    tyne_contents_manager.share_tyne(
        await tyne_contents_manager.load_tyne_model(tyne_2.file_name, dbsession, user),
        dbsession,
        TyneShareResponse(
            description="a share",
            shares=[],
            users=[],
            general_access_level=ClientAccessLevel.VIEW,
            general_access_scope=AccessScope.ANYONE,
            share_message=None,
            team_name=None,
            is_app=False,
        ),
    )

    assert (
        get_tyne_access_level(tyne_1.file_name, dbsession, share_with)
        == AccessLevel.EDIT
    )
    assert (
        get_tyne_access_level(tyne_2.file_name, dbsession, share_with)
        == AccessLevel.VIEW
    )
    assert get_tyne_access_level(tyne_3.file_name, dbsession, share_with) is None
    assert (
        get_tyne_access_level(tyne_4.file_name, dbsession, share_with)
        == AccessLevel.EDIT
    )


@pytest.mark.asyncio
async def test_import_tyne_json(dbsession, tyne_contents_manager):
    user = mock_user()
    new_tyne = await tyne_contents_manager.new_tyne(
        dbsession, user, requirements="neptyne\nother_lib"
    )
    tyne_model = new_tyne.tyne_model
    file_name = tyne_model.file_name
    tyne_content = new_tyne.tyne_content

    for a1, val in (("A1", 1), ("A2", 2)):
        addr = Address.from_a1(a1)
        tyne_content.sheets.sheets[0].cells[addr] = SheetCell(
            cell_id=addr, raw_code=f"={val}", output=val
        )

    tyne_content.notebook_cells = [NotebookCell(cell_id="00", raw_code="print(A1)")]
    tyne_content.to_orm_model(tyne_model)
    dbsession.add(tyne_model)
    dbsession.commit()

    # Download flow
    tyne_model = await tyne_contents_manager.load_tyne_model(file_name, dbsession, user)
    tyne_dict = tyne_model.to_dict()
    tyne_2 = await tyne_contents_manager.import_tyne_json(
        dbsession,
        tyne_dict,
        "",
        user,
    )

    exported_1 = export_tyne_model(tyne_model, tyne_content)

    del exported_1["file_name"]

    exported_2 = export_tyne_model(tyne_2.tyne_model, tyne_2.tyne_content)
    del exported_2["file_name"]

    assert exported_1 == exported_2


@pytest.mark.asyncio
async def test_import_xlsx(dbsession, tyne_contents_manager):
    user = mock_user()
    filename = "xlsx_sample.xlsx"
    full_path = os.path.join(
        os.path.dirname(__file__), "..", "server/import_test_data", filename
    )
    assert os.path.exists(full_path)
    data = open(full_path, "rb").read()
    tyne_content = (
        await tyne_contents_manager.import_xlsx(dbsession, data, filename, user)
    ).tyne_content

    assert tyne_content.sheets.sheets[0].name == "First sheet"
    assert tyne_content.sheets.sheets[1].name == "Second sheet"

    cell = get_cell(tyne_content, Address(0, 1, 0))
    assert cell.raw_code == "Vinyl"
    assert cell.output.output_type == OutputType.EXECUTE_RESULT

    cell = get_cell(tyne_content, Address(7, 12, 0))
    assert cell.raw_code == "={1:1}"

    cell = get_cell(tyne_content, Address(3, 27, 0))
    assert cell.raw_code == "=5/0"
    assert cell.output.ename == "#DIV/0!"
    assert cell.output.output_type == OutputType.ERROR

    cell = get_cell(tyne_content, Address(2, 15, 0))
    assert cell.raw_code == "=LET(x,1,LET(y,2,x+y))"
    assert cell.output.output_type == OutputType.EXECUTE_RESULT
    assert cell.output.data["application/json"] == 3

    cell = get_cell(tyne_content, Address(10, 0, 1))
    assert cell.raw_code == "=F.TEST({92,75,97,85,87,82,79},{84,89,87,95,82,71})"
    assert cell.output.output_type == OutputType.EXECUTE_RESULT
    assert cell.output.data["application/json"] == pytest.approx(0.860052078, rel=1e-5)

    cell = get_cell(tyne_content, Address(5, 0, 1))
    assert cell.raw_code == "=NOW()"
    assert cell.output.output_type == OutputType.EXECUTE_RESULT
    assert cell.attributes["numberFormat"] == "date-M/d/yy h:mm"

    cell = get_cell(tyne_content, Address(6, 0, 1))
    assert cell.raw_code == "=TIME(13,33,56)"
    assert cell.output.output_type == OutputType.EXECUTE_RESULT
    assert cell.attributes["numberFormat"] == "date-h:mm a"

    cell = get_cell(tyne_content, Address(5, 1, 1))
    assert cell.raw_code == "=TODAY()"
    assert cell.output.output_type == OutputType.EXECUTE_RESULT
    assert cell.attributes["numberFormat"] == "date-MM-dd-yy"

    cell = get_cell(tyne_content, Address(0, 0, 0))
    assert cell.raw_code == "0.75"
    assert cell.output.output_type == OutputType.EXECUTE_RESULT
    assert cell.attributes["numberFormat"] == "percentage"

    with pytest.raises(HTTPError):
        # Bad XLSX file
        await tyne_contents_manager.import_xlsx(dbsession, b"bad file data", "", user)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "filename",
    (
        "xlsx_rich_formatting[excel].xlsx",
        "xlsx_rich_formatting[google].xlsx",
        "xlsx_rich_formatting[calc].xlsx",
    ),
)
async def test_import_xlsx_rich_formatting(dbsession, tyne_contents_manager, filename):
    user = mock_user()
    full_path = os.path.join(
        os.path.dirname(__file__), "..", "server/import_test_data", filename
    )
    assert os.path.exists(full_path)
    data = open(full_path, "rb").read()
    tyne_model_with_content = await tyne_contents_manager.import_xlsx(
        dbsession, data, filename, user
    )

    tyne_content = tyne_model_with_content.tyne_content

    sheet = tyne_content.sheets.sheets[0]
    assert sheet.name == "Sheet1"

    assert get_cell(tyne_content, "A1").attributes["textStyle"] == "bold"
    assert get_cell(tyne_content, "A2").attributes["textStyle"] == "italic"
    assert get_cell(tyne_content, "A3").attributes["textStyle"] == "underline"
    assert get_cell(tyne_content, "A4").attributes["textStyle"] == "bold italic"
    assert get_cell(tyne_content, "A5").attributes["textStyle"] == "italic underline"

    assert get_cell(tyne_content, "A6").attributes["color"].lower() == "#ff0000"
    assert (
        get_cell(tyne_content, "A7").attributes["backgroundColor"].lower() == "#ffff00"
    )

    assert (
        get_cell(tyne_content, "A9").attributes["link"].startswith("http://google.com")
    )

    orange_color = 0xFFC000
    orange_tall_cell1 = get_cell(tyne_content, "A12")
    orange_tall_cell2 = get_cell(tyne_content, "B12")

    assert (
        pytest.approx(
            int(orange_tall_cell1.attributes["backgroundColor"][1:], 16), rel=300
        )
        == orange_color
    )
    assert (
        pytest.approx(
            int(orange_tall_cell2.attributes["backgroundColor"][1:], 16), rel=300
        )
        == orange_color
    )

    assert sheet.attributes["rowsSizes"][str(orange_tall_cell1.cell_id.row)] == 106

    assert (
        orange_tall_cell2.attributes["note"]
        == "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus pharetra bibendum convallis. Vivamus bibendum nibh luctus, aliquet eros non, laoreet lectus."
    )

    assert get_cell(tyne_content, "B13").attributes["lineWrap"] == "wrap"

    assert (
        get_cell(tyne_content, "E1").attributes["border"]
        == "border-top border-bottom border-left border-right"
    )
    assert (
        get_cell(tyne_content, "F1").attributes["border"]
        == "border-top border-bottom border-left border-right"
    )

    assert get_cell(tyne_content, "H1").attributes["border"] == "border-left"
    assert get_cell(tyne_content, "I1").attributes["border"] == "border-right"
    assert get_cell(tyne_content, "H3").attributes["border"] == "border-top"
    assert get_cell(tyne_content, "I3").attributes["border"] == "border-bottom"

    blue_color = 0xCFE2F3
    blue_wide_cell1 = get_cell(tyne_content, "J1")
    blue_wide_cell2 = get_cell(tyne_content, "J2")

    assert (
        pytest.approx(
            int(blue_wide_cell1.attributes["backgroundColor"][1:], 16), rel=300
        )
        == blue_color
    )
    assert (
        pytest.approx(
            int(blue_wide_cell2.attributes["backgroundColor"][1:], 16), rel=300
        )
        == blue_color
    )

    assert sheet.attributes["colsSizes"][str(blue_wide_cell1.cell_id.column)] == 197

    assert get_cell(tyne_content, "E4").attributes["textAlign"] == "left"
    assert get_cell(tyne_content, "F4").attributes["textAlign"] == "center"
    assert get_cell(tyne_content, "G4").attributes["textAlign"] == "right"

    assert get_cell(tyne_content, "E5").attributes["verticalAlign"] == "top"
    assert get_cell(tyne_content, "F5").attributes["verticalAlign"] == "middle"

    cell = get_cell(tyne_content, "E6")
    assert cell.attributes["font"] == "Roboto Mono"
    assert cell.attributes["fontSize"] == 14

    assert get_cell(tyne_content, "E9").attributes["colSpan"] == 3
    assert get_cell(tyne_content, "H9").attributes["rowSpan"] == 3


class DummyCredentials(AnonymousCredentials):
    def before_request(self, request, method, url, headers):
        headers["x-goog-api-key"] = "AIzaSyAlDAJmuvHt_lu-6sWxfPDWObLHjOpL48E"


def get_cell(tyne_content: TyneContent, cell_id: str | Address) -> SheetCell:
    if isinstance(cell_id, str):
        addr = Address.from_a1(cell_id)
    else:
        addr = cell_id
    return tyne_content.sheets.sheets[addr.sheet].cells[addr]


@pytest.mark.asyncio
async def test_import_google_sheets(dbsession, tyne_contents_manager):
    # NOTE: Can't test compiled_code here because no dash is available to do the compilation.

    user = mock_user()
    url = "https://docs.google.com/spreadsheets/d/10_1_D1_ntwdkuOzKEGCcW5wbDej2eTGp4EvJu5F8MGQ"
    credentials = DummyCredentials()
    try:
        tyne_content = (
            await tyne_contents_manager.import_google_sheet(
                dbsession, url, user, credentials
            )
        ).tyne_content
    except APIError as e:
        if e.response.json()["code"] == 500:
            pytest.skip("Google sheets API is not available")
        raise

    assert tyne_content.sheets.sheets[0].name == "First sheet"
    assert tyne_content.sheets.sheets[1].name == "Second sheet"

    cell = get_cell(tyne_content, "A1")
    assert cell.raw_code == "0.75"
    assert cell.output.output_type == OutputType.EXECUTE_RESULT
    assert cell.attributes["numberFormat"] == "percentage"

    cell = get_cell(tyne_content, "C2")
    assert cell.output.output_type == OutputType.EXECUTE_RESULT
    assert cell.output.data["application/json"] == pytest.approx(3.141592654, rel=1e-5)

    cell = get_cell(tyne_content, Address.from_a1("E8"))
    assert cell.raw_code == "25"
    assert cell.attributes["numberFormat"] == "money"

    cell = get_cell(tyne_content, Address.from_a1("G1"))
    assert cell.output.output_type == OutputType.EXECUTE_RESULT
    assert cell.output.data["application/json"] == 15

    cell = get_cell(tyne_content, Address.from_a1("C1"))
    assert cell.raw_code == "=MAX(B1:B3)"
    assert cell.output.output_type == OutputType.EXECUTE_RESULT
    assert cell.output.data["application/json"] == 30

    cell = get_cell(tyne_content, Address.from_a1("E1"))
    assert cell.raw_code == "=1/0"
    assert cell.output.ename == "#DIV/0!"
    assert cell.output.output_type == OutputType.ERROR

    # Array
    cell = get_cell(tyne_content, Address(0, 12, 0))
    assert cell.raw_code == "={1,2,3;4,5,6}"
    assert cell.output.data["application/json"] == 1

    cell = get_cell(tyne_content, Address(5, 0, 0))
    assert cell.raw_code == "=NOW()"
    assert cell.output.output_type == OutputType.EXECUTE_RESULT
    assert cell.attributes["numberFormat"] == "date-MM/dd/yyyy hh:mm:ss"

    cell = get_cell(tyne_content, Address(5, 1, 0))
    assert cell.raw_code == "=TODAY()"
    assert cell.output.output_type == OutputType.EXECUTE_RESULT
    assert cell.attributes["numberFormat"] == "date-MM/dd/yyyy"

    cell = get_cell(tyne_content, Address(5, 2, 0))
    assert cell.raw_code == "=TIME(14,45,11)"
    assert cell.output.output_type == OutputType.EXECUTE_RESULT
    assert cell.attributes["numberFormat"] == "date-hh:mm:ss"

    cell = get_cell(tyne_content, Address(0, 5, 0))
    assert cell.output.output_type == OutputType.EXECUTE_RESULT
    assert cell.output.data["application/json"] is True

    with pytest.raises(HTTPError):
        # Bad url
        await tyne_contents_manager.import_google_sheet(
            dbsession, "http://bad_url", user, credentials
        )
    with pytest.raises(HTTPError):
        # Protected sheets
        await tyne_contents_manager.import_google_sheet(
            dbsession,
            "https://docs.google.com/spreadsheets/d/1dM6pTMb8gSYjQjGCLYG9SdIrWCgh7XZ3mTCqiw_I4Es/edit#gid=0",
            user,
            credentials,
        )


@pytest.mark.asyncio
async def test_import_google_sheets_rich_formatting(dbsession, tyne_contents_manager):
    user = mock_user()
    url = "https://docs.google.com/spreadsheets/d/1YCXylr_ogrWhQzrwn7B7ZKttaHERyLDl8IJziOPPb38"
    credentials = DummyCredentials()
    try:
        tyne_model_with_content = await tyne_contents_manager.import_google_sheet(
            dbsession, url, user, credentials
        )
    except APIError as e:
        if e.response.json()["code"] == 500:
            pytest.skip("Google sheets API is not available")
        raise

    tyne_content = tyne_model_with_content.tyne_content

    sheet = tyne_content.sheets.sheets[0]
    assert sheet.name == "Sheet1"

    assert get_cell(tyne_content, "A1").attributes["textStyle"] == "bold"
    assert get_cell(tyne_content, "A2").attributes["textStyle"] == "italic"
    assert get_cell(tyne_content, "A3").attributes["textStyle"] == "underline"
    assert get_cell(tyne_content, "A4").attributes["textStyle"] == "bold italic"
    assert get_cell(tyne_content, "A5").attributes["textStyle"] == "italic underline"

    assert get_cell(tyne_content, "A6").attributes["color"] == "#ff0000"
    assert get_cell(tyne_content, "A7").attributes["backgroundColor"] == "#ffff00"

    assert get_cell(tyne_content, "A9").attributes["link"] == "http://google.com"

    orange_color = "#ffc000"
    orange_tall_cell1 = get_cell(tyne_content, "A12")
    orange_tall_cell2 = get_cell(tyne_content, "B12")

    assert orange_tall_cell1.attributes["backgroundColor"] == orange_color
    assert orange_tall_cell2.attributes["backgroundColor"] == orange_color

    assert sheet.attributes["rowsSizes"][str(orange_tall_cell1.cell_id.row)] == 141

    assert (
        orange_tall_cell2.attributes["note"]
        == "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus pharetra bibendum convallis. Vivamus bibendum nibh luctus, aliquet eros non, laoreet lectus."
    )

    assert get_cell(tyne_content, "A13").attributes["lineWrap"] == "truncate"
    assert get_cell(tyne_content, "B13").attributes["lineWrap"] == "wrap"
    assert get_cell(tyne_content, "C13").attributes["lineWrap"] == "overflow"

    assert (
        get_cell(tyne_content, "E1").attributes["border"]
        == "border-top border-bottom border-left border-right"
    )
    assert (
        get_cell(tyne_content, "F1").attributes["border"]
        == "border-top border-bottom border-left border-right"
    )

    assert get_cell(tyne_content, "H1").attributes["border"] == "border-left"
    assert get_cell(tyne_content, "I1").attributes["border"] == "border-right"
    assert get_cell(tyne_content, "H3").attributes["border"] == "border-top"
    assert get_cell(tyne_content, "I3").attributes["border"] == "border-bottom"

    blue_color = "#cee1f3"
    blue_wide_cell1 = get_cell(tyne_content, "J1")
    blue_wide_cell2 = get_cell(tyne_content, "J2")

    assert blue_wide_cell1.attributes["backgroundColor"] == blue_color
    assert blue_wide_cell2.attributes["backgroundColor"] == blue_color

    assert sheet.attributes["colsSizes"][str(blue_wide_cell1.cell_id.column)] == 183

    assert get_cell(tyne_content, "E4").attributes["textAlign"] == "left"
    assert get_cell(tyne_content, "F4").attributes["textAlign"] == "center"
    assert get_cell(tyne_content, "G4").attributes["textAlign"] == "right"

    assert get_cell(tyne_content, "E5").attributes["verticalAlign"] == "top"
    assert get_cell(tyne_content, "F5").attributes["verticalAlign"] == "middle"
    assert get_cell(tyne_content, "G5").attributes["verticalAlign"] == "bottom"

    cell = get_cell(tyne_content, "E6")
    assert cell.attributes["font"] == "Roboto Mono"
    assert cell.attributes["fontSize"] == 14

    assert get_cell(tyne_content, "E9").attributes["colSpan"] == 3
    assert get_cell(tyne_content, "H9").attributes["rowSpan"] == 3


@pytest.mark.asyncio
async def test_export_xlsx(tyne_contents_manager, dbsession):
    user = mock_user()
    filename = "xlsx_sample.xlsx"
    full_path = os.path.join("server/import_test_data", filename)
    assert os.path.exists(full_path)
    data = open(full_path, "rb").read()
    tyne = await tyne_contents_manager.import_xlsx(dbsession, data, filename, user)
    content = tyne.tyne_content

    tyne.tyne_model.properties = {"sheetsOrder": [99, 1, 0]}
    contents = tyne_contents_manager.export_xlsx(
        content.sheets, tyne.tyne_model.properties
    )
    wb = openpyxl.load_workbook(BytesIO(contents))
    assert [sheet.title for sheet in wb] == ["Second sheet", "First sheet"]

    assert wb["First sheet"]["A1"].value == 0.75
    assert wb["First sheet"]["A2"].value == "Vinyl"
    assert wb["Second sheet"]["B1"].value == 82
    assert wb["Second sheet"]["F1"].value == "=NOW()"
    assert wb["Second sheet"]["A1"].value == "=3/0"
    assert wb["Second sheet"]["A4"].value == "=#NUM!"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "filename",
    (
        "xlsx_rich_formatting[excel].xlsx",
        "xlsx_rich_formatting[google].xlsx",
        "xlsx_rich_formatting[calc].xlsx",
    ),
)
async def test_export_xlsx_rich_formatting(tyne_contents_manager, dbsession, filename):
    user = mock_user()
    full_path = os.path.join("server/import_test_data", filename)
    assert os.path.exists(full_path)
    data = open(full_path, "rb").read()
    tyne_model_with_content = await tyne_contents_manager.import_xlsx(
        dbsession, data, filename, user
    )
    tyne_model = tyne_model_with_content.tyne_model
    sheets = tyne_sheets_from_orm_model(tyne_model.sheets, tyne_model.next_sheet_id)

    tyne_model.properties = {}
    contents = tyne_contents_manager.export_xlsx(sheets, tyne_model.properties)
    wb = openpyxl.load_workbook(BytesIO(contents))

    sheet = wb["Sheet1"]

    assert sheet["A1"].font.b
    assert sheet["A2"].font.i
    assert sheet["A3"].font.u
    a4_font_style = sheet["A4"].font
    assert a4_font_style.b and a4_font_style.i
    a5_font_style = sheet["A5"].font
    assert a5_font_style.i and a5_font_style.u

    assert sheet["A6"].font.color.rgb == "00FF0000"
    assert sheet["A7"].fill.fgColor.rgb == "00FFFF00"

    assert sheet["A9"].hyperlink.target.startswith("http://google.com")

    orange_color = 0xFFC000
    orange_tall_cell1 = sheet["A12"]
    orange_tall_cell2 = sheet["B12"]

    assert (
        pytest.approx(int(orange_tall_cell1.fill.fgColor.rgb, 16), rel=300)
        == orange_color
    )
    assert (
        pytest.approx(int(orange_tall_cell2.fill.fgColor.rgb, 16), rel=300)
        == orange_color
    )

    assert sheet.row_dimensions[orange_tall_cell1.row].height == 106

    assert (
        orange_tall_cell2.comment.text
        == "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus pharetra bibendum convallis. Vivamus bibendum nibh luctus, aliquet eros non, laoreet lectus."
    )

    assert sheet["B13"].alignment.wrapText

    assert sheet["E1"].border.top.style == "thin"
    assert sheet["E1"].border.bottom.style == "thin"
    assert sheet["E1"].border.left.style == "thin"
    assert sheet["E1"].border.right.style == "thin"

    assert sheet["F1"].border.top.style == "thin"
    assert sheet["F1"].border.bottom.style == "thin"
    assert sheet["F1"].border.left.style == "thin"
    assert sheet["F1"].border.right.style == "thin"

    assert sheet["H1"].border.left.style == "thin"
    assert sheet["I1"].border.right.style == "thin"
    assert sheet["H3"].border.top.style == "thin"
    assert sheet["I3"].border.bottom.style == "thin"

    blue_color = "00CFE2F3"
    blue_wide_cell1 = sheet["J1"]
    blue_wide_cell2 = sheet["J2"]

    assert blue_wide_cell1.fill.fgColor.rgb == blue_color
    assert blue_wide_cell2.fill.fgColor.rgb == blue_color

    assert (
        pytest.approx(
            sheet.column_dimensions[blue_wide_cell1.column_letter].width
            * OPENPYXL_COL_PIXELS_PER_UNIT
        )
        == 197
    )

    assert sheet["E4"].alignment.horizontal == "left"
    assert sheet["F4"].alignment.horizontal == "center"
    assert sheet["G4"].alignment.horizontal == "right"

    assert sheet["E5"].alignment.vertical == "top"
    assert sheet["F5"].alignment.vertical == "center"

    assert sheet["E6"].font.sz == 14
    assert sheet["E6"].font.name == "Roboto Mono"

    merged_cells = {rng.coord for rng in sheet.merged_cells.ranges}
    assert "E9:G9" in merged_cells
    assert "H9:H11" in merged_cells


@pytest.mark.asyncio
async def test_export_csv(tyne_contents_manager, dbsession):
    user = mock_user()
    filename = "xlsx_sample.xlsx"
    full_path = os.path.join("server/import_test_data", filename)
    assert os.path.exists(full_path)
    data = open(full_path, "rb").read()

    content = (
        await tyne_contents_manager.import_xlsx(dbsession, data, filename, user)
    ).tyne_content
    contents = tyne_contents_manager.export_csv(content.sheets, 0)
    data = list(csv.reader(StringIO(contents)))

    assert data[0][0] == "0.75"
    assert data[1][3] == "13.23"
    assert data[1][0] == "Vinyl"
    assert data[8][6] == "False"
    assert data[27][3] == "#DIV/0!"


@pytest.mark.asyncio
async def test_copy_tyne(tyne_contents_manager, dbsession):
    user = mock_user()
    source_tyne = (await tyne_contents_manager.new_tyne(dbsession, user)).tyne_model
    source_tyne.notebooks[0].requirements = "numpy"
    dbsession.add(source_tyne)

    model = (
        await tyne_contents_manager.copy_tyne(
            dbsession, source_tyne.file_name, None, user
        )
    ).tyne_model
    assert model.notebooks[0].contents == source_tyne.notebooks[0].contents
    assert model.sheets[0].contents == source_tyne.sheets[0].contents
    assert model.name == source_tyne.name + " (copy)"
    assert (
        model.notebooks[0].requirements
        == source_tyne.notebooks[0].requirements
        == "numpy"
    )

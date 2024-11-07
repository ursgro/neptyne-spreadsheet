from dataclasses import dataclass
from typing import Any

from neptyne_kernel.cell_address import Address
from neptyne_kernel.expression_compiler import DEFAULT_GRID_SIZE
from neptyne_kernel.neptyne_protocol import Severity
from neptyne_kernel.tyne_model.cell import NotebookCell, SheetCell
from neptyne_kernel.tyne_model.events import Event
from neptyne_kernel.tyne_model.jupyter_notebook import Output, OutputType
from neptyne_kernel.tyne_model.kernel_init_data import TyneInitializationData
from neptyne_kernel.tyne_model.sheet import Sheet, TyneSheets
from server.models import Event as EventModel
from server.models import Notebook, Tyne
from server.models import Sheet as SheetModel
from server.serialize_orm_tynes import notebook_cells_from_orm_model

CLEAR_BYTE_STRING = "\x1b[H\x1b[2J"
MAX_REPL_HISTORY = 100


def is_clear_output(output: Output | str | float) -> bool:
    if isinstance(output, str | float):
        return False
    return output.output_type == OutputType.STREAM and output.text in (
        CLEAR_BYTE_STRING,
        [CLEAR_BYTE_STRING],
    )


def is_repl_clear_cell(cell: NotebookCell) -> bool:
    return bool(
        cell.outputs
        and isinstance(cell.outputs, list)
        and any(is_clear_output(output) for output in cell.outputs)
    )


def trim_notebook_cells(notebook_cells: list[NotebookCell]) -> list[NotebookCell]:
    """Remove cells that are only clearing the REPL."""
    if not notebook_cells:
        return notebook_cells
    code_panel_cell, repl_cells = (
        notebook_cells[0],
        notebook_cells[1:],
    )

    if len(repl_cells) > MAX_REPL_HISTORY:
        repl_cells = repl_cells[-MAX_REPL_HISTORY:]

    clearing_repl = False
    for repl_cell in reversed(repl_cells):
        if clearing_repl:
            repl_cell.outputs = None
        elif is_repl_clear_cell(repl_cell):
            clearing_repl = True

    return [code_panel_cell, *repl_cells]


@dataclass
class TyneContent:
    """Server class for Tyne state which is updated by a connected kernel and asynchronously saved.

    They may or may not live in the kernel, but they are updated by actions associated with a
    kernel connection. This class itself shouldn't be used in the kernel.
    """

    optional_sheets: TyneSheets | None
    notebook_cells: list[NotebookCell]
    optional_events: list[Event] | None

    @property
    def sheets(self) -> TyneSheets:
        assert self.optional_sheets is not None
        return self.optional_sheets

    @property
    def events(self) -> list[Event]:
        assert self.optional_events is not None
        return self.optional_events

    @classmethod
    def empty(cls) -> "TyneContent":
        return cls(
            optional_sheets=TyneSheets(),
            notebook_cells=[],
            optional_events=[],
        )

    @classmethod
    def from_orm_model_no_sheets(cls, db_model: Tyne) -> "TyneContent":
        notebook_cells = notebook_cells_from_orm_model(db_model)
        return cls(
            optional_sheets=None,
            notebook_cells=notebook_cells,
            optional_events=[
                Event(
                    message=event.message,
                    severity=Severity(event.severity),
                    extra=event.extra,
                    created=event.created,
                )
                for event in db_model.events
            ],
        )

    def to_orm_model(self, db_model: Tyne) -> None:
        if not db_model.notebooks:
            db_model.notebooks = [Notebook()]
        db_model.notebooks[0].contents = {
            cell.cell_id: cell.to_dict() for cell in self.notebook_cells
        }

        if self.optional_sheets is not None:
            sheet_models = {sheet.sheet_id: sheet for sheet in db_model.sheets or []}
            for sheet_id in [*sheet_models.keys()]:
                if sheet_id not in self.sheets.sheets:
                    del sheet_models[sheet_id]
            for sheet_id, sheet in self.sheets.sheets.items():
                if sheet_id not in sheet_models:
                    sheet_models[sheet_id] = SheetModel()
                sheet_model = sheet_models[sheet_id]
                sheet_model.attributes = sheet.attributes
                sheet_model_content = {}
                for cell_id, cell in sheet.cells.items():
                    sheet_model_content[str(cell_id)] = cell.to_dict()

                    sheet_model.contents = sheet_model_content
                    sheet_model.n_cols = sheet.grid_size[0]
                    sheet_model.n_rows = sheet.grid_size[1]
                    sheet_model.sheet_id = sheet.id
                    sheet_model.name = sheet.name

            db_model.sheets = [*sheet_models.values()]
            db_model.next_sheet_id = self.sheets.next_sheet_id
        if self.optional_events is not None:
            db_model.events = [
                EventModel(
                    message=event.message,
                    severity=event.severity.value,
                    extra=event.extra,
                    created=event.created,
                )
                for event in self.events
            ]

    def clear_outputs(self) -> None:
        for rev_ix, cell in enumerate(reversed(self.notebook_cells)):
            if is_repl_clear_cell(cell):
                self.notebook_cells = [self.notebook_cells[0]] + self.notebook_cells[
                    len(self.notebook_cells) - rev_ix :
                ]
                break

        for cell in self.notebook_cells:
            cell.outputs = None
            if cell.metadata:
                cell.metadata = {
                    k: v for k, v in cell.metadata.items() if k != "duration"
                }


def export_tyne_model(model: Tyne, content: TyneContent) -> dict[str, Any]:
    return {
        "sheets": None if content.sheets is None else content.sheets.export(True),
        "notebooks": [{"cells": [c.export() for c in content.notebook_cells]}],
        "properties": model.properties or {},
        "published": model.published,
        "screenshot_url": model.screenshot_url,
        "name": model.name,
        "requirements": model.notebooks[0].requirements if model.notebooks else "",
        "file_name": model.file_name,
        "events": None
        if content.events is None
        else [e.export() for e in content.events],
    }


def get_initialization_payload(
    model: Tyne, content: TyneContent, shard_id: int
) -> TyneInitializationData:
    google_sheet = model.google_sheet
    return TyneInitializationData(
        sheets=content.sheets,
        code_panel_code=content.notebook_cells[0].compiled_code
        if content.notebook_cells
        else "",
        requirements=model.notebooks[0].requirements if model.notebooks else "",
        requires_recompile=model.requires_recompile,
        shard_id=shard_id,
        tyne_file_name=model.file_name,
        in_gs_mode=google_sheet is not None,
        gsheets_sheet_id=google_sheet.sheet_id if google_sheet else "",
        time_zone=(model.properties or {}).get("time_zone") or "UTC",
        env=model.environment_variables or {},
    )


def serializeable_sheet_from_db_model(sheet_model: SheetModel) -> Sheet:
    assert sheet_model.sheet_id is not None
    sheet = Sheet(sheet_model.sheet_id, sheet_model.name or "Sheet0")
    if sheet_model.contents:
        sheet.cells = {
            Address.from_a1_or_str(cell_id): SheetCell.from_dict(value, copy_dict=False)
            for cell_id, value in sheet_model.contents.items()
        }
    if sheet_model.n_cols and sheet_model.n_rows:
        sheet.grid_size = sheet_model.n_cols, sheet_model.n_rows
    else:
        sheet.grid_size = DEFAULT_GRID_SIZE
    sheet.attributes = sheet_model.attributes

    return sheet


def tyne_sheets_from_orm_model(
    sheets: list[SheetModel], next_sheet_id: int | None
) -> TyneSheets:
    tyne_sheets = TyneSheets()
    if next_sheet_id is None:
        # If the database doesn't know its next ID, pick it
        next_sheet_id = len(sheets)
    tyne_sheets.next_sheet_id = next_sheet_id
    if sheets:
        tyne_sheets.sheets = {}
        # We assume that we have one sheet with sheet_id 0, so make sure:
        if all(sheet.sheet_id != 0 for sheet in sheets):
            sheets[0].sheet_id = 0
        for sheet_model in sheets:
            if sheet_model.sheet_id is None:
                sheet_model.sheet_id = tyne_sheets.new_sheet_id()
            sheet = serializeable_sheet_from_db_model(sheet_model)
            assert sheet.id not in tyne_sheets.sheets
            tyne_sheets.sheets[sheet.id] = sheet
    else:
        tyne_sheets.new_sheet()
    return tyne_sheets


@dataclass
class TyneModelWithContent:
    tyne_model: Tyne
    tyne_content: TyneContent

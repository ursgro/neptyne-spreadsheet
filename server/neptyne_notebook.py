import copy
import json
from datetime import datetime, timezone
from tokenize import TokenError
from typing import Any

from jupyter_client.jsonutil import json_clean

from neptyne_kernel import expression_compiler
from neptyne_kernel.cell_address import is_sheet_cell
from neptyne_kernel.expression_compiler import (
    process_sheet_transformation,
    reformat_code,
    tokenize_with_ranges,
    transform_crosses_infinite_range,
)
from neptyne_kernel.insert_delete_helper import transformation_is_unbounded
from neptyne_kernel.mime_handling import (
    ATTRIBUTE_UPDATE_KEY,
    REQUEST_ATTRIBUTE_UPDATE_KEY,
)
from neptyne_kernel.mime_types import JSON_MIME_KEY
from neptyne_kernel.neptyne_protocol import (
    CellChange,
    MessageTypes,
    RunCellsContent,
)
from neptyne_kernel.session_info import NeptyneSessionInfo
from neptyne_kernel.spreadsheet_error import cut_string_stack
from neptyne_kernel.transformation import Transformation
from neptyne_kernel.tyne_model.cell import CODEPANEL_CELL_ID, NotebookCell
from neptyne_kernel.tyne_model.jupyter_notebook import Output, OutputType
from neptyne_kernel.widgets.output_widgets import PLOTLY_MIME_TYPE, plotly_to_html
from server.messages import (
    CELL_ID_TAG,
    CONTENT_TAG,
    HEADER_TAG,
    META_DATA_TAG,
    MSG_TYPE_TAG,
    Msg,
)


def output_from_data(
    data: dict[str, list[str] | str],
    output_type: OutputType = OutputType.EXECUTE_RESULT,
) -> Output | None:
    data = {
        k: v
        for k, v in data.items()
        if k != ATTRIBUTE_UPDATE_KEY and k != REQUEST_ATTRIBUTE_UPDATE_KEY
    }
    if not data or (len(data) == 1 and data.get(JSON_MIME_KEY, "") is None):
        return None
    try:
        json.dumps(data, allow_nan=False)
    except (TypeError, ValueError):
        data = json_clean(data)
    return Output(
        data=data,
        output_type=output_type,
        execution_count=1,
        metadata=None,
        name=None,
        text=None,
        ename=None,
        evalue=None,
        traceback=None,
    )


def cell_meta_data_for_msg(msg: Msg) -> dict[str, Any]:
    msg_header = msg[HEADER_TAG]
    date = msg_header.get("date")
    if isinstance(date, datetime):
        date = date.isoformat()
    session_info = NeptyneSessionInfo.from_message_header(msg_header)
    cell_metadata = {
        "date": date,
        "user_email": session_info.user_email,
        "user_name": session_info.user_name,
    }
    return cell_metadata


class TyneNotebook:
    cells: list[NotebookCell]

    def __init__(self, cells: list[NotebookCell]):
        if not cells:
            cells = [NotebookCell(cell_id=CODEPANEL_CELL_ID)]
        self.cells = cells

    def code_panel_code(self) -> str:
        return self.code_panel().raw_code

    def code_panel(self) -> NotebookCell:
        return self.get_cell_by_id(CODEPANEL_CELL_ID)

    def new_cell(self, cell_id: str | None = None) -> NotebookCell:
        if cell_id is None:
            max_id = max(
                (int(cell.cell_id) for cell in self.cells if cell.cell_id.isdigit()),
                default=0,
            )
            cell_id = f"0{max_id+1}"
        self.cells.append(NotebookCell(cell_id=cell_id))
        return self.cells[-1]

    def get_cell_by_id(
        self, cell_id: str | None, create_if_missing: bool = False
    ) -> NotebookCell:
        if cell_id is not None:
            for cell in self.cells:
                if cell.cell_id == cell_id:
                    return cell
        if not create_if_missing:
            raise KeyError(f"No notebook cell found with id: {cell_id}")
        return self.new_cell(cell_id)

    def get_cell_id_for_stream_output(self, msg: Msg) -> str:
        """For stream messages if there is no cell_id the stream comes from the sheet.

        Create a new cell in the REPL or if the last cell is already an output cell, append the message."""
        cell_info: NotebookCell

        if self.cells and len(self.cells) > 1 and not self.cells[-1].raw_code:
            cell_info = self.cells[-1]
        else:
            cell_info = self.new_cell()
        cell_id = cell_info.cell_id
        cell_info.metadata = {
            **(cell_info.metadata or {}),
            **cell_meta_data_for_msg(msg),
        }
        return cell_id

    def process_kernel_error(self, cell_id: str | None, msg: Msg) -> None:
        content = msg[CONTENT_TAG]
        if not cell_id or is_sheet_cell(cell_id):
            cell_id = self.get_cell_id_for_stream_output(msg)
        if content.get("traceback"):
            content["traceback"] = cut_string_stack(content["traceback"])
        assert cell_id
        self.handle_output(
            cell_id,
            Output.from_dict({**content, "output_type": OutputType.ERROR}),
            execution_count=None,
        )

    def handle_output(
        self, cell_id: str, output: Output, execution_count: int | None
    ) -> None:
        if not output.metadata:
            output.metadata = {}
        output.metadata["time"] = datetime.now().isoformat()
        cell = self.get_cell_by_id(cell_id)
        outputs = cell.outputs
        if outputs is None:
            cell.outputs = [output]
        else:
            if not isinstance(outputs, list):
                existing_output = output_from_data({JSON_MIME_KEY: outputs})
                if existing_output is None:
                    outputs = []
                else:
                    outputs = [existing_output]
            outputs.append(output)
        if execution_count is not None:
            cell.execution_count = execution_count

    def process_stream(
        self,
        cell_id: str | None,
        stream_content: dict[str, Any],
        msg: Msg,
    ) -> str:
        if not cell_id or is_sheet_cell(cell_id) or cell_id == CODEPANEL_CELL_ID:
            cell_id = self.get_cell_id_for_stream_output(msg)

        assert cell_id
        self.handle_output(
            cell_id,
            Output.from_dict(
                {
                    **stream_content,
                    "text": stream_content["text"].strip("\n"),
                    "output_type": "stream",
                }
            ),
            execution_count=None,
        )
        return cell_id

    def process_cell_execute_result(
        self, cell_id: str, content: dict[str, Any]
    ) -> None:
        output = output_from_data(
            content["data"], output_type=OutputType.EXECUTE_RESULT
        )
        if output:
            self.handle_output(
                cell_id,
                output,
                content["execution_count"],
            )

    def process_traceback(
        self,
        cell_id: str,
        traceback: list[dict[str, str]],
        traceback_type: str = "neptyne",
    ) -> Output | None:
        if (
            cell_id == CODEPANEL_CELL_ID
        ):  # We only handle structured tracebacks on the code cell
            output = Output(
                data=None,
                execution_count=None,
                metadata={"traceback_type": traceback_type, "traceback": traceback},
                output_type=OutputType.ERROR,
                name=None,
                text=None,
                ename="",
                evalue="",
                traceback=[],
            )
            self.handle_output(
                cell_id,
                output,
                execution_count=None,
            )
            return output
        return None

    def process_display_data(
        self,
        cell_id: str,
        content: dict[str, Any],
    ) -> None:
        cell = self.get_cell_by_id(cell_id)
        if isinstance(cell.outputs, list):
            cell.outputs = [
                o
                for o in (cell.outputs or [])
                if o.output_type != OutputType.DISPLAY_DATA
            ]
        data = content["data"]
        if PLOTLY_MIME_TYPE in data:
            data["text/html"] = plotly_to_html(data[PLOTLY_MIME_TYPE], height="300px")

        output = output_from_data(data, output_type=OutputType.DISPLAY_DATA)
        if output:
            self.handle_output(
                cell_id,
                output,
                execution_count=None,
            )

    def process_cell_execute_reply(
        self, cell_id: str, content: dict[str, Any], parent_header: dict[str, Any]
    ) -> None:
        execution_count = content.get("execution_count")
        if execution_count:
            if not is_sheet_cell(cell_id):
                cell = self.get_cell_by_id(cell_id)
                if start := parent_header.get("date"):
                    if isinstance(start, str):
                        start = datetime.fromisoformat(start)
                    duration = datetime.now(timezone.utc) - start
                    if not cell.metadata:
                        cell.metadata = {}
                    cell.metadata["duration"] = duration.total_seconds()
                cell.execution_count = execution_count
        if content.get("status") == "error":
            content["traceback"] = cut_string_stack(content["traceback"])

    def process_code_update(
        self,
        cell_id: str,
        raw_code: str,
        cell_metadata: dict | None = None,
        reformat_compiled_code: bool = True,
    ) -> str:
        cell_info = self.get_cell_by_id(cell_id, create_if_missing=True)
        cell_info.outputs = None
        cell_info.raw_code = raw_code
        metadata = cell_info.metadata or {}
        cell_info.metadata = {**metadata, **(cell_metadata or {})}
        cell_info.compiled_code = expression_compiler.compile_expression(
            cell_info.raw_code,
            compute_cells_mentioned=False,
            reformat_compiled_code=reformat_compiled_code,
        ).compiled_code
        return cell_info.compiled_code

    def run_notebook_cell_msg(
        self, msg: Msg, cell_id: str, code: str
    ) -> tuple[str, Msg, Msg]:
        try:
            code, is_modified = reformat_code(code)
            if cell_id != CODEPANEL_CELL_ID:
                code = code.rstrip("\n")
        except (ValueError, TokenError):
            # Black couldn't format the code. That's OK.
            is_modified = False
        if not is_modified:
            code = code.lstrip("\n")
        cell_metadata = cell_meta_data_for_msg(msg)

        try:
            # We used to pass reformat_compiled_code=is_modified here, but I can't remember why. If it
            # causes problems, ping Douwe
            code = self.process_code_update(
                cell_id,
                code,
                cell_metadata=cell_metadata,
                reformat_compiled_code=False,
            )
        except (ValueError, TokenError):
            # Our expression compiler couldn't parse the code. That's OK. Run it anyway and the
            # kernel will tell the user something useful.
            pass

        msg[HEADER_TAG][CELL_ID_TAG] = cell_id
        msg[META_DATA_TAG][CELL_ID_TAG] = cell_id

        # Running a notebook cell does not have a meaningful "undo"
        undo_msg = copy.deepcopy(msg)
        undo_msg[HEADER_TAG][MSG_TYPE_TAG] = MessageTypes.RUN_CELLS.value
        undo_msg[CONTENT_TAG].update(
            RunCellsContent(
                to_run=[CellChange(None, cell_id, content="", mime_type=None)],
                notebook=True,
                for_ai=False,
                gs_mode=False,
                current_sheet=0,
                ai_tables=[],
                current_sheet_name=None,
                sheet_ids_by_name=None,
            ).to_dict()
        )
        return code, msg, undo_msg

    def adjust_codepanel_add_delete_cells(
        self, transformation: Transformation, sheet_name: str
    ) -> str | None:
        code_panel = self.code_panel()
        tokens = tokenize_with_ranges(code_panel.raw_code)
        transformed_raw = None
        if transformation_is_unbounded(transformation):
            transformed_raw = process_sheet_transformation(
                tokens,
                transformation,
                sheet_name,
                is_different_sheet=transformation.sheet_id != 0,
            )
        if transformed_raw or transform_crosses_infinite_range(tokens, transformation):
            code = transformed_raw if transformed_raw else code_panel.raw_code
            code_panel.compiled_code = code
            return code
        return None

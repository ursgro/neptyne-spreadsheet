import pytest

import server.models as orm
from neptyne_kernel.cell_address import Address
from neptyne_kernel.neptyne_protocol import Severity
from neptyne_kernel.tyne_model.cell import CellMetadata, NotebookCell
from neptyne_kernel.tyne_model.dash_graph import DashGraph
from neptyne_kernel.tyne_model.save_message import V1DashSaveMessage
from neptyne_kernel.tyne_model.sheet import TyneSheets
from server.models import Event, Tyne
from testing.seed_test_data import create_test_models


@pytest.mark.asyncio
async def test_tyne_store(dbsession, tyne_store):
    file_name = create_test_models(dbsession)

    sheets = TyneSheets()
    addr = Address(0, 0, 0)
    cells = {
        0: {
            addr: 2,
        }
    }
    cell_meta = {
        addr: CellMetadata(
            raw_code="=1+1",
        )
    }
    graph = DashGraph()
    notebook_cells = [NotebookCell(cell_id="00")]
    msg = V1DashSaveMessage(
        sheets_without_cells=sheets,
        cells=cells,
        cell_meta=cell_meta,
        graph=graph,
    )
    blob = msg.to_bytes()
    await tyne_store.decode_and_save(
        file_name,
        sheets_blob=blob,
        sheets_blob_version=V1DashSaveMessage.VERSION,
        notebook_cells=notebook_cells,
        events=[Event(severity=Severity.INFO, message="hello")],
        min_next_tick=0,
    )

    saved = dbsession.query(Tyne).filter_by(file_name=file_name).one()
    contents = saved.sheets[0].contents
    assert len(contents) == 1
    assert contents[addr.to_cell_id()]["raw_code"] == "=1+1"
    assert len(saved.events) == 1
    assert saved.events[0].message == "hello"

    assert len(saved.notebooks) == 1

    assert saved.notebooks[0].contents["00"]["raw_code"] == ""

    notebook_cells[0].raw_code = "def add_one(x): return x + 1"

    await tyne_store.decode_and_save(
        file_name,
        sheets_blob=None,
        sheets_blob_version=V1DashSaveMessage.VERSION,
        notebook_cells=notebook_cells,
        events=None,
        min_next_tick=0,
    )

    with orm.db.sessionmaker() as dbsession2:
        saved2 = dbsession2.query(Tyne).filter_by(file_name=file_name).one()
        assert (
            saved2.notebooks[0].contents["00"]["raw_code"]
            == "def add_one(x): return x + 1"
        )

        assert saved2.events[0].message == "hello"
        assert saved2.sheets[0].contents[addr.to_cell_id()]["raw_code"] == "=1+1"

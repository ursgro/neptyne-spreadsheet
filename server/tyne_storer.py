import asyncio
import json
import math
from concurrent.futures import Executor, ProcessPoolExecutor
from datetime import datetime
from multiprocessing import cpu_count, get_context
from typing import Any

from sqlalchemy.orm import Session

from neptyne_kernel.json_tools import dict_from_bytes
from neptyne_kernel.tyne_model.cell import NotebookCell
from neptyne_kernel.tyne_model.events import Event
from neptyne_kernel.tyne_model.save_message import (
    V1DashSaveMessage,
    json_encode,
    tyne_content_dict,
)
from neptyne_kernel.tyne_model.sheet import TyneSheets
from server import models as orm
from server.blob_store import BlobStore, LocalFileStore
from server.models import db, set_tyne_property
from server.tyne_content import TyneContent, tyne_sheets_from_orm_model


def init_db_subprocess(config: dict[str, str]) -> None:
    orm.db.engine.dispose(close=False)
    orm.db._engines = {}
    # Inherit connection options from the module-level 'db' object
    db.configure_preset(**config)
    orm.db.create_engine()


def blob_to_sheets(
    blob: bytes | None, version: int | None
) -> tuple[TyneSheets | None, float | None]:
    if blob is None:
        return None, None
    if version == 1:
        message = V1DashSaveMessage.from_dict(dict_from_bytes(blob))
        sheets = TyneSheets.from_dict(
            tyne_content_dict(
                message.sheets_without_cells,
                message.cells,
                message.cell_meta,
                message.graph,
            )
        )
        return sheets, message.next_tick
    else:
        raise ValueError("Unknown sheets_blob_version %s" % version)


def decode_and_save(
    tyne_file_name: str,
    sheets_blob: bytes | None,
    sheets_blob_version: int | None,
    notebook_cells: list[NotebookCell],
    events: list[Event] | None,
    min_next_tick: int = 0,
) -> TyneContent:
    sheets, next_tick = blob_to_sheets(sheets_blob, sheets_blob_version)
    if next_tick:
        next_tick = max(min_next_tick, next_tick)
    content = TyneContent(
        optional_sheets=sheets,
        notebook_cells=notebook_cells,
        optional_events=None if events is None else events,
    )
    save_to_db(tyne_file_name, content, next_tick, requirements=None)
    return content


def save_to_db(
    file_name: str,
    content: TyneContent,
    next_tick: float | None,
    requirements: str | None,
) -> None:
    with orm.db.sessionmaker() as db_session:
        db_model = (
            db_session.query(orm.Tyne).filter_by(file_name=file_name).one_or_none()
        )
        if db_model:
            content.to_orm_model(db_model)
            db_model.requires_recompile = False
            db_model.last_modified = datetime.now()
            if next_tick is not None:
                if next_tick == 0:
                    db_model.next_tick = None
                else:
                    db_model.next_tick = math.floor(next_tick)
            if requirements is not None:
                db_model.notebooks[0].requirements = requirements
            db_session.add(db_model)
            db_session.commit()
            return db_model.id
        else:
            raise ValueError(f"No TyneModel found with file_name {file_name}")


def exec_set_tyne_property(tyne_id: int, key: str, value: Any) -> None:
    with orm.db.sessionmaker() as db_session:
        tyne = db_session.query(orm.Tyne).get(tyne_id)
        set_tyne_property(tyne, key, value)
        db_session.commit()


class TyneStorer:
    executor: Executor
    blob_store: BlobStore

    def __init__(
        self, executor: Executor | None = None, blob_store: BlobStore | None = None
    ):
        config = db.get_config()
        if not executor:
            num_workers = max(1, cpu_count() // 2)
            executor = ProcessPoolExecutor(
                initializer=init_db_subprocess,
                initargs=(config,),
                mp_context=get_context("spawn"),
                max_workers=num_workers,
            )

            for _ in range(num_workers):
                executor.submit(lambda: None)

        self.executor = executor
        self.blob_store = blob_store or LocalFileStore()

    async def decode_and_save(
        self,
        tyne_file_name: str,
        *,
        sheets_blob: bytes | None,
        sheets_blob_version: int | None,
        notebook_cells: list[NotebookCell],
        events: list[Event] | None,
        min_next_tick: int = 0,
    ) -> None:
        content = await asyncio.get_event_loop().run_in_executor(
            self.executor,
            decode_and_save,
            tyne_file_name,
            sheets_blob,
            sheets_blob_version,
            notebook_cells,
            events,
            min_next_tick,
        )
        if sheets_blob is not None and events is not None:
            # Don't store in contents store if we're only updating the notebook cells:
            await self.save_content_to_store(tyne_file_name, content)

    async def save(
        self, tyne_file_name: str, content: TyneContent, requirements: str | None = None
    ) -> None:
        await asyncio.get_event_loop().run_in_executor(
            self.executor, save_to_db, tyne_file_name, content, None, requirements
        )
        await self.save_content_to_store(tyne_file_name, content)

    async def save_content_to_store(
        self, tyne_file_name: str, tyne_content: TyneContent
    ) -> None:
        content_blob = json_encode(
            {
                "version": 1,
                "sheets": tyne_content.sheets.to_dict(),
                "notebook_cells": [
                    cell.to_dict() for cell in tyne_content.notebook_cells
                ],
            }
        )
        await self.blob_store.put(
            f"{tyne_file_name}.json", content_blob, content_type="application/json"
        )

    async def load(self, tyne_file_name: str, db_session: Session) -> TyneContent:
        model = db_session.query(orm.Tyne).filter_by(file_name=tyne_file_name).one()
        content = TyneContent.from_orm_model_no_sheets(model)
        try:
            store_content = json.loads(
                await self.blob_store.get(f"{tyne_file_name}.json")
            )
            content.optional_sheets = TyneSheets.from_dict(store_content["sheets"])
            # We don't load the notebook cells from the store, as the db is more fresh
        except FileNotFoundError:
            content.optional_sheets = tyne_sheets_from_orm_model(
                model.sheets, model.next_sheet_id
            )
        return content

    async def set_tyne_property(self, tyne_id: int, key: str, value: Any) -> None:
        await asyncio.get_event_loop().run_in_executor(
            self.executor, exec_set_tyne_property, tyne_id, key, value
        )

    def cleanup(self) -> None:
        print("Shutting down TyneStorer")
        if isinstance(self.executor, ProcessPoolExecutor):
            self.executor.shutdown()

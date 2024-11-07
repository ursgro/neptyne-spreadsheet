import asyncio
import hashlib
import random
import string
import sys
import time
from datetime import datetime
from functools import partial
from typing import Any, Awaitable, Callable, Literal

from sqlalchemy import null, select, true, update
from sqlalchemy.exc import NoResultFound
from sqlalchemy.orm import Query, Session

from neptyne_kernel.neptyne_protocol import AccessScope, TyneShareResponse
from neptyne_kernel.tyne_model.cell import CODEPANEL_CELL_ID, NotebookCell
from neptyne_kernel.tyne_model.kernel_init_data import TyneInitializationData
from server.models import (
    AccessLevel,
    APIKey,
    EmailShare,
    GoogleSheet,
    NonUser,
    Notebook,
    OrganizationShare,
    Share,
    Sheet,
    Tyne,
    TyneSecrets,
    User,
    set_tyne_property,
)
from server.models import Tyne as TyneModel
from server.neptyne_kernel_service import NeptyneKernelService
from server.proxied_tyne import ProxiedTyne
from server.tyne_content import (
    TyneContent,
    TyneModelWithContent,
    get_initialization_payload,
)
from server.tyne_export import TyneExportMixin
from server.tyne_import import TyneImportMixin
from server.tyne_info import (
    TYNE_PROTOCOL_VERSION,
)
from server.tyne_storer import TyneStorer


def shard_id(tyne_file_name: str, num_shards: int) -> int:
    return hashlib.md5(tyne_file_name.encode()).digest()[0] % num_shards


class WrongShardError(Exception):
    pass


class TyneContentsManager(TyneImportMixin, TyneExportMixin):
    def __init__(
        self,
        tyne_store: TyneStorer,
        *,
        kernel_name: str = "python_local",
        shard_index: int = 0,
        num_shards: int = 1,
    ) -> None:
        self.tynes: dict[str, ProxiedTyne] = {}
        self.tyne_store = tyne_store
        self.kernel_name = kernel_name

        assert 0 <= shard_index < num_shards

        self.shard_index = shard_index
        self.num_shards = num_shards

    def is_owner_shard(self, tyne_file_name: str) -> bool:
        return shard_id(tyne_file_name, self.num_shards) == self.shard_index

    async def disable_tick(
        self,
        session: Session,
        tyne_file_name: str,
        kernel_manager: NeptyneKernelService,
    ) -> None:
        if not self.is_owner_shard(tyne_file_name):
            raise WrongShardError()

        if tyne_proxy := self.tynes.get(tyne_file_name):
            tyne_proxy.disconnect()
            tyne_proxy.disconnect_clients()
            del self.tynes[tyne_file_name]
            await kernel_manager.shutdown_kernel(tyne_file_name)

        statement = (
            update(Tyne)
            .where(Tyne.file_name == tyne_file_name)
            .values(has_tick=False, next_tick=null())
        )
        session.execute(statement)
        session.commit()

    async def tick(
        self, session: Session, kernel_manager: NeptyneKernelService
    ) -> None:
        async def load_content(tyne_id: str) -> TyneInitializationData:
            model = (
                session.query(TyneModel).filter(TyneModel.file_name == tyne_id).one()
            )
            tyne_content = await self.tyne_store.load(tyne_id, session)
            return get_initialization_payload(
                model,
                tyne_content,
                shard_id(tyne_id, self.num_shards),
            )

        tynes_to_tick = self.load_tynes_to_tick(session)

        tick_futures = []
        for tyne_file_name in tynes_to_tick:
            tick_futures.append(
                self.tynes[tyne_file_name].tick(
                    partial(load_content, tyne_file_name), kernel_manager
                )
            )

        results = await asyncio.gather(*tick_futures, return_exceptions=True)
        for tyne_file_name, result in zip(tynes_to_tick, results):
            if isinstance(result, Exception):
                print(
                    f"tick error in tyne : {tyne_file_name}",
                    result,
                    file=sys.stderr,
                )
                # TODO: notify the user?
                await self.disable_tick(session, tyne_file_name, kernel_manager)

    def load_tynes_to_tick(self, session: Session) -> list[str]:
        statement = (
            select(TyneModel)
            .filter(TyneModel.next_tick > 0)
            .filter(TyneModel.next_tick < time.time() + 120)
        )

        to_tick = []

        for (tyne_model,) in session.execute(statement):
            if not self.is_owner_shard(tyne_model.file_name):
                continue
            if tyne_model.file_name not in self.tynes:
                tyne_info = ProxiedTyne(
                    tyne_model,
                    tyne_storer=self.tyne_store,
                    kernel_name=self.kernel_name,
                )
                self.tynes[tyne_model.file_name] = tyne_info
            print("queueing", tyne_model.file_name, "for tick")
            to_tick.append(tyne_model.file_name)
        return to_tick

    async def new_db_model(
        self, session: Session, user: User | None, file_name: str | None = None
    ) -> TyneModel:
        if file_name is None:
            # It would be better if the db took care of this, but that clutters things up:
            while True:
                file_name = "".join(
                    random.choice(string.ascii_lowercase + string.digits)
                    for _ in range(10)
                )
                if file_name in self.tynes:
                    continue
                # we don't use exists() here because that applies a user filter
                exists = session.query(
                    session.query(TyneModel)
                    .filter(TyneModel.file_name == file_name)
                    .exists()
                ).scalar()
                if not exists:
                    break
        model = TyneModel(
            file_name=file_name,
            version=TYNE_PROTOCOL_VERSION,
            tyne_owner_id=user.tyne_owner_id if user else None,
            last_modified=datetime.now(),
        )
        return model

    async def new_tyne(
        self,
        session: Session,
        user: User | None,
        name: str | None = None,
        content: TyneContent | None = None,
        requirements: str | None = None,
        linked_gsheet_id: str | None = None,
        file_name: str | None = None,
    ) -> TyneModelWithContent:
        model = await self.new_db_model(session, user, file_name)
        if name is not None:
            model.name = name
        else:
            model.name = "Untitled"
        if content is None:
            content = TyneContent.empty()
        else:
            model.requires_recompile = True
        if not content.notebook_cells:
            code_panel_cell = NotebookCell(
                raw_code="",
                cell_id=CODEPANEL_CELL_ID,
            )
            content.notebook_cells.append(code_panel_cell)
        if linked_gsheet_id:
            model.google_sheet = GoogleSheet(sheet_id=linked_gsheet_id)
        TyneContent(
            optional_sheets=None,
            notebook_cells=content.notebook_cells,
            optional_events=None,
        ).to_orm_model(model)
        session.add(model)
        session.commit()
        await self.tyne_store.save(model.file_name, content, requirements=requirements)
        return TyneModelWithContent(model, content)

    async def get(
        self,
        tyne_file_name: str,
        session: Session,
        user: User | NonUser,
        gsheet_auth_token: str | None = None,
        api_key: str | None = None,
    ) -> ProxiedTyne | None:
        tyne_proxy = self.tynes.get(tyne_file_name)
        if tyne_proxy:
            # it exists in the cache, but hit the database to make sure the user has access
            if (
                get_tyne_access_level(
                    tyne_file_name,
                    session,
                    user,
                    gsheet_auth_token is not None,
                    api_key,
                )
                is None
            ):
                return None
        else:
            try:
                tyne = await self.load_tyne_model(
                    tyne_file_name, session, user, gsheet_auth_token, api_key
                )
            except NoSuchTyneError:
                return None
            tyne_proxy = ProxiedTyne(
                tyne,
                self.tyne_store,
                self.kernel_name,
            )
            if self.is_owner_shard(tyne_file_name):
                self.tynes[tyne_file_name] = tyne_proxy
        return tyne_proxy

    def file_rename(
        self, old_file_name: str, new_file_name: str, session: Session
    ) -> None:
        # Beware! Once renamed, the old file name will 404 (no redirect).
        try:
            tyne_model = (
                session.query(TyneModel)
                .filter(TyneModel.file_name == old_file_name)
                .one()
            )
        except NoResultFound:
            raise NoSuchTyneError()

        tyne_model.file_name = new_file_name
        session.commit()

        if old_tyne := self.tynes.get(old_file_name):
            old_tyne.disconnect()
            old_tyne.disconnect_clients()
            del self.tynes[old_file_name]

    async def load_tyne_model(
        self,
        tyne_file_name: str,
        session: Session,
        user: User | NonUser,
        gsheet_auth_token: str | None = None,
        api_key: str | None = None,
    ) -> TyneModel:
        import server.gsheets_extension

        if gsheet_auth_token:
            tyne_model = await server.gsheets_extension.get_gsheet_tyne(
                tyne_file_name, gsheet_auth_token, session
            )
            if not tyne_model:
                raise NoSuchTyneError()
            return tyne_model
        elif api_key:
            return api_key_load_tyne_model(api_key, tyne_file_name, session)
        else:
            tynes = (
                authorized_tyne_query(session, user)
                .filter(TyneModel.file_name == tyne_file_name)
                .all()
            )
            if not tynes:
                raise NoSuchTyneError()
            tyne = tynes[0]

        return tyne

    async def copy_tyne(
        self,
        session: Session,
        tyne_id: str,
        new_name: str | None,
        user: User | Literal[NonUser.GSHEET],
        linked_gsheet_id: str | None = None,
    ) -> TyneModelWithContent:
        copy_from = await self.load_tyne_model(tyne_id, session, user)
        if new_name is None:
            new_name = copy_from.name + " (copy)"
        content = await self.tyne_store.load(tyne_id, session)
        content.clear_outputs()
        new_tyne = await self.new_tyne(
            session,
            None if user is NonUser.GSHEET else user,
            name=new_name,
            content=content,
            linked_gsheet_id=linked_gsheet_id,
        )
        model = new_tyne.tyne_model
        model.version = copy_from.version
        model.next_tick = copy_from.next_tick
        if copy_from.notebooks and (
            requirements := copy_from.notebooks[0].requirements
        ):
            model.notebooks[0].requirements = requirements
        set_tyne_property(model, "copied_from", tyne_id)
        session.add(model)
        session.commit()
        return new_tyne

    async def delete_tyne(self, session: Session, file_name: str, user: User) -> None:
        tynes = (
            authorized_tyne_query(session, user)
            .filter(TyneModel.file_name == file_name)
            .all()
        )
        if not tynes:
            raise NoSuchTyneError()
        if file_name in self.tynes:
            tyne = self.tynes[file_name]
            if tyne.tyne_info.kernel_client and tyne.tyne_info.kernel_client.parent:
                await tyne.tyne_info.kernel_client.parent.shutdown_kernel()
            self.tynes[file_name].disconnect()
            del self.tynes[file_name]
        tyne_id = tynes[0].id
        session.query(Notebook).filter(Notebook.tyne_id == tyne_id).delete()
        session.query(Sheet).filter(Sheet.tyne_id == tyne_id).delete()
        session.query(Share).filter(Share.tyne_id == tyne_id).delete()
        session.query(EmailShare).filter(EmailShare.tyne_id == tyne_id).delete()
        session.query(TyneSecrets).filter(TyneSecrets.tyne_id == tyne_id).delete()
        session.query(TyneModel).filter(TyneModel.id == tyne_id).delete()

    def get_tyne_property(self, tyne: TyneModel, key: str, default_value: Any) -> Any:
        return (
            tyne.properties.get(key, default_value)
            if tyne.properties
            else default_value
        )

    def share_tyne(
        self,
        tyne: TyneModel,
        session: Session,
        response: TyneShareResponse,
    ) -> list:
        existing_shares: dict[str, Share | EmailShare] = {}
        for us in session.query(Share).filter(Share.tyne_id == tyne.id).all():
            existing_shares[us.user.email] = us
        for es in session.query(EmailShare).filter(EmailShare.tyne_id == tyne.id).all():
            existing_shares[es.email] = es

        response_published = response.general_access_scope == AccessScope.ANYONE
        description = tyne.properties.get("description", "") if tyne.properties else ""
        is_app = tyne.properties.get("is_app", False) if tyne.properties else False

        if (
            response_published != tyne.published
            or response.description != description
            or response.is_app != is_app
        ):
            tyne.published = response_published
            set_tyne_property(tyne, "description", response.description)
            set_tyne_property(tyne, "is_app", response.is_app)
            session.add(tyne)

        emails_to_send: list = []

        if response.general_access_scope == AccessScope.TEAM:
            assert response.general_access_level
            access_level = AccessLevel(response.general_access_level.name.upper())
            if tyne.tyne_owner.user.organization:
                org = tyne.tyne_owner.user.organization.organization
                organization_id = org.id
                response.team_name = org.name
                share = OrganizationShare(
                    tyne_id=tyne.id,
                    organization_id=organization_id,
                    access_level=access_level,
                )
                session.merge(share)
            else:
                # Tyne owner is not part of an organization
                pass
        else:
            session.query(OrganizationShare).filter(
                OrganizationShare.tyne_id == tyne.id
            ).delete()

        for share_record in response.shares:
            email = share_record.email
            access_level = AccessLevel(share_record.access_level.name.upper())
            users = session.query(User).filter(User.email == email).all()
            if not users:
                share = EmailShare(
                    tyne_id=tyne.id, email=email, access_level=access_level
                )
            else:
                share = Share(
                    tyne_id=tyne.id, user_id=users[0].id, access_level=access_level
                )
            if existing_shares.pop(email, None) is None:
                emails_to_send.append(email)
            session.merge(share)

        for record in existing_shares.values():
            session.delete(record)

        return emails_to_send

    async def prepare_for_shutdown(self, timeout: float = 30) -> None:
        """Disconnect clients subscribers to kernels and tell all kernels to save"""
        save_events = []

        async def wait(event: asyncio.Event) -> None:
            try:
                await asyncio.wait_for(event.wait(), timeout=timeout)
            except asyncio.TimeoutError:
                pass

        for tyne in self.tynes.values():
            event = asyncio.Event()
            save_events.append(wait(event))
            tyne.prepare_for_shutdown(event)
        await asyncio.gather(*save_events)

    async def disconnect_tynes(self) -> None:
        for tyne in self.tynes.values():
            tyne.disconnect()
            if tyne.tyne_info.kernel_client and tyne.tyne_info.kernel_client.parent:
                await tyne.tyne_info.kernel_client.parent.shutdown_kernel()

    def init_data_loader(
        self, tyne_file_name: str, session_maker: Callable[[], Session]
    ) -> Callable[[], Awaitable[TyneInitializationData]]:
        async def load() -> TyneInitializationData:
            with session_maker() as session:
                model = (
                    session.query(Tyne).filter(Tyne.file_name == tyne_file_name).one()
                )
                tyne_content = await self.tyne_store.load(tyne_file_name, session)

                return get_initialization_payload(
                    model,
                    tyne_content,
                    shard_id(model.file_name, self.num_shards),
                )

        return load


class NoSuchTyneError(Exception):
    pass


class InvalidAPIKeyError(Exception):
    pass


def authorized_tyne_query(session: Session, user: User | NonUser) -> Query:
    if user == NonUser.ANONYMOUS:
        return session.query(TyneModel).filter(
            (TyneModel.published == true())
            | (TyneModel.properties["is_app"].as_string() == "true")
        )
    if user == NonUser.MAINTENANCE or user == NonUser.GSHEET:
        return session.query(TyneModel)
    assert not isinstance(user, NonUser)
    return (
        session.query(TyneModel)
        .outerjoin(TyneModel.shared_to_users)
        .outerjoin(TyneModel.shared_to_organization)
        .filter(
            (TyneModel.tyne_owner_id == user.tyne_owner_id)
            | (Share.user_id == user.id)
            | (TyneModel.published == true())
            | (TyneModel.properties["is_app"].as_string() == "true")
            | (
                user.organization
                and (
                    OrganizationShare.organization_id
                    == user.organization.organization_id
                )
            )
        )
    )


def max_access_level(
    level1: AccessLevel | None, level2: AccessLevel | None
) -> AccessLevel | None:
    if level1 == AccessLevel.EDIT or level2 == AccessLevel.EDIT:
        return AccessLevel.EDIT
    if level1 == AccessLevel.COMMENT or level2 == AccessLevel.COMMENT:
        return AccessLevel.COMMENT
    if level1 == AccessLevel.VIEW or level2 == AccessLevel.VIEW:
        return AccessLevel.VIEW
    return None


def get_tyne_access_level(
    tyne_file_name: str,
    session: Session,
    user: User | NonUser,
    is_gsheet_tyne: bool = False,
    api_key: str | None = None,
) -> AccessLevel | None:
    from server import gsheets_extension

    if is_gsheet_tyne:
        try:
            gsheets_extension.get_gsheet_for_tyne(session, tyne_file_name)
            return AccessLevel.EDIT
        except NoSuchTyneError:
            return None
    if api_key:
        try:
            api_key_load_tyne_model(api_key, tyne_file_name, session)
            return AccessLevel.EDIT
        except (InvalidAPIKeyError, NoSuchTyneError):
            return None

    access_level = None
    tynes = (
        authorized_tyne_query(session, user)
        .filter(TyneModel.file_name == tyne_file_name)
        .all()
    )
    if not tynes:
        return None
    if (
        user is NonUser.ANONYMOUS
        or user is NonUser.MAINTENANCE
        or user is NonUser.GSHEET
    ):
        return AccessLevel.VIEW
    assert isinstance(user, User)
    tyne = tynes[0]
    if tyne.tyne_owner_id == user.tyne_owner_id:
        return AccessLevel.EDIT
    for share in tyne.shared_to_users:
        if share.user_id == user.id:
            access_level = max_access_level(access_level, share.access_level)

    if (
        user.organization
        and tyne.shared_to_organization
        and user.organization.organization_id
        == tyne.shared_to_organization.organization_id
    ):
        access_level = max_access_level(
            access_level, tyne.shared_to_organization.access_level
        )
    tyne_properties = tyne.properties or {}
    if tyne.published or tyne_properties.get("is_app"):
        access_level = max_access_level(access_level, AccessLevel.VIEW)
    return access_level


def api_key_load_tyne_model(
    api_key: str,
    tyne_file: str,
    session: Session,
) -> TyneModel:
    key = session.query(APIKey).filter(APIKey.key == api_key).first()
    if not key:
        raise InvalidAPIKeyError()

    tyne = key.tyne
    if not tyne:
        raise NoSuchTyneError()

    if tyne_file == tyne.file_name:
        return tyne
    if tyne.google_sheet and tyne.google_sheet.sheet_id == tyne_file:
        return tyne

    raise NoSuchTyneError()

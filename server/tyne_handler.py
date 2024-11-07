import json
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session
from tornado import web
from tornado_sqlalchemy import SessionMixin

from neptyne_kernel.mime_types import JSON_MIME_KEY
from server.cors import allow_cors
from server.gsheet_auth import GSheetTokenClaims, decode_gsheet_extension_token
from server.gsheet_tynes import get_tyne_for_gsheet
from server.models import (
    AccessLevel,
    NonUser,
    Tyne,
    TyneUser,
    User,
    set_tyne_property,
)
from server.tyne_content import TyneContent, export_tyne_model
from server.tyne_contents_manager import TyneContentsManager, shard_id
from server.users import (
    authenticate_request,
)

REMOTE_TYNE_KEY = "remoteTyne"


class TyneHandlerAllowMaintenanceAndAnon(SessionMixin, web.RequestHandler):
    user: User | NonUser
    time_zone: str | None

    def initialize(self, tyne_contents_manager: TyneContentsManager) -> None:
        self.tyne_contents_manager = tyne_contents_manager

    async def prepare(self) -> None:
        if not self.request.method or self.request.method.upper() == "OPTIONS":
            return
        try:
            self.user = await authenticate_request(
                self,
                self.session,
            )
        except web.HTTPError:
            self.user = NonUser.ANONYMOUS
        self.time_zone = self.get_argument("tz", None)

    def set_default_headers(self) -> None:
        allow_cors(self)

    async def return_exported(
        self,
        tyne_model: Tyne,
        content: TyneContent,
        access: AccessLevel = AccessLevel.EDIT,
    ) -> None:
        res = {
            REMOTE_TYNE_KEY: {
                "access_level": access.value,
                "shard_id": shard_id(
                    tyne_model.file_name, self.tyne_contents_manager.num_shards
                ),
                **export_tyne_model(tyne_model, content),
            }
        }
        contents = json.dumps(res)

        if (
            self.time_zone
            and (not tyne_model.properties or "time_zone" not in tyne_model.properties)
            and self.user not in (None, NonUser.ANONYMOUS, NonUser.MAINTENANCE)
        ):
            set_tyne_property(tyne_model, "time_zone", self.time_zone)

        self.set_header("Content-Type", JSON_MIME_KEY)
        await self.finish(contents)

    def options(self, *args: Any, **kwargs: Any) -> None:
        self.set_status(204)
        self.finish()


class TyneHandler(TyneHandlerAllowMaintenanceAndAnon):
    user: User
    _resolved_tyne_file_name: str | None = None

    def resolve_tyne_file_name(self, tyne_file_name_from_path: str) -> str:
        if self._resolved_tyne_file_name is not None:
            return self._resolved_tyne_file_name
        if tyne_file_name_from_path == "gsheet":
            auth_token = self.get_gsheet_token()
            tyne_id = get_tyne_for_gsheet(self.session, auth_token.sheet_id)
            if tyne_id is None:
                raise web.HTTPError(404, "No Tyne found for this GSheet")
            self._resolved_tyne_file_name = self.session.execute(
                select(Tyne.file_name).where(Tyne.id == tyne_id)
            ).scalar_one()
        else:
            self._resolved_tyne_file_name = tyne_file_name_from_path
        return self._resolved_tyne_file_name

    def get_gsheet_token(self) -> GSheetTokenClaims:
        token = self.request.headers.get("X-Neptyne-GSheet-Auth-Token")
        if not token:
            raise web.HTTPError(401, "Missing X-Neptyne-GSheet-Auth-Token header")
        return decode_gsheet_extension_token(token)

    async def prepare(self) -> None:
        await super().prepare()
        if not self.request.method or self.request.method.upper() != "OPTIONS":
            if self.user is NonUser.MAINTENANCE:
                raise web.HTTPError(403)
            elif self.user is NonUser.ANONYMOUS:
                raise web.HTTPError(401)


def track_tyne_open(user: User, tyne: Tyne, session: Session) -> None:
    with session.begin_nested():
        tyne_user = (
            session.query(TyneUser)
            .filter(TyneUser.tyne_id == tyne.id)
            .filter(TyneUser.user_id == user.id)
            .first()
        )
        if tyne_user is None:
            tyne_user = TyneUser(tyne_id=tyne.id, user_id=user.id)
        tyne_user.last_opened = datetime.now()
        session.add(tyne_user)

import argparse
import asyncio
import json
import logging
import os
import pprint
import random
import re
import signal
import string
import urllib
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

import aiohttp
import jwt
import nest_asyncio
import zmq
from aiohttp import ClientTimeout
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from jupyter_client.provisioning import KernelProvisionerFactory
from kubernetes_asyncio.client import ApiClient
from oauthlib.oauth2 import OAuth2Error
from sqlalchemy import func, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.sql.expression import desc, not_, select, text, true
from streamlit.file_util import get_static_dir
from tornado import ioloop, web
from tornado.escape import json_decode
from tornado.httpclient import HTTPError
from tornado.log import enable_pretty_logging
from tornado.web import StaticFileHandler
from tornado_sqlalchemy import SessionMixin, SQLAlchemy
from zmq.asyncio import Context

from neptyne_kernel.cell_address import Range
from neptyne_kernel.kernel_runtime import email_to_color
from neptyne_kernel.mime_handling import (
    output_to_value,
)
from neptyne_kernel.mime_types import JSON_MIME_KEY
from neptyne_kernel.neptyne_protocol import (
    MessageTypes,
    SheetData,
    TyneCategories,
    TyneListItem,
    UserViewState,
)
from neptyne_kernel.tyne_model.cell import SheetCell
from neptyne_kernel.tyne_model.jupyter_notebook import Output
from server import gsheet_auth
from server.api_quota_manager import APIQuotaManager
from server.blob_store import BlobStore, GCSStore
from server.codeassist import ai_snippet_reply
from server.cors import allow_cors
from server.fake_executor import FakeExecutor
from server.feature_flags import FeatureFlags
from server.gsheet_auth import decode_gsheet_extension_token
from server.gsheets_access import InvalidTokenError, get_access_token
from server.gsheets_extension import (
    ConnectedTyneMetadataHandler,
    DriveOpenHandler,
    GSheetEvaluationHandler,
    GSheetsConnectedTyneHandler,
    get_or_create_tyne_for_sheet,
)
from server.kernels import k8s
from server.kernels.k8s import KernelPodPool
from server.kernels.kernel_handlers import (
    StreamlitWebsocketHandler,
    TyneWebsocketHandler,
)
from server.kernels.local_provisioner import NeptyneLocalProvisioner
from server.kernels.spec_manager import NeptyneKernelSpecManager
from server.models import (
    AccessLevel,
    APIKey,
    FeatureToggle,
    FirebaseUser,
    FunctionCallCache,
    NonUser,
    Tyne,
    TyneOwner,
    TyneUser,
    User,
    db,
    set_tyne_property,
)
from server.neptyne_kernel_service import NeptyneKernelService
from server.proxied_tyne import ProxiedTyne
from server.publish import MetaTagProxyHandler, TyneEmbedHandler
from server.sheet_linter import SheetLinterHandler
from server.streamlit_handlers import (
    StreamlitGuestMainHandler,
    StreamlitHealthHandler,
    StreamlitHostConfigHandler,
    StreamlitHostMainHandler,
    StreamlitProxyHandler,
    StyleInjectingStaticHandler,
)
from server.tyne_content import TyneContent
from server.tyne_contents_manager import (
    InvalidAPIKeyError,
    NoSuchTyneError,
    TyneContentsManager,
    WrongShardError,
    authorized_tyne_query,
    get_tyne_access_level,
    shard_id,
)
from server.tyne_handler import (
    TyneHandler,
    TyneHandlerAllowMaintenanceAndAnon,
    track_tyne_open,
)
from server.tyne_info import KernelSubscriber
from server.tyne_sharding import forward_to_owner, maybe_forward_request_to_owner
from server.tyne_storer import TyneStorer
from server.users import (
    authenticate_request,
    get_capabilities,
)

nest_asyncio.apply()

TEST_USER_EMAIL = "tryneptyne@neptyne.dev"

KERNEL_IMAGE_NAME = "neptyne-kernel"

KERNEL_IMAGE_TAG = os.getenv("GIT_SHA", default="latest")
k8s.KERNEL_IMAGE = f"{KERNEL_IMAGE_NAME}:{KERNEL_IMAGE_TAG}"
k8s.KERNEL_VERSION_TAG = KERNEL_IMAGE_TAG

RESEARCH_TIMEOUT = 60 * 30  # 30 minutes


async def export_debug_info(tyne_proxy: ProxiedTyne, model: Tyne | None) -> dict:
    kc = tyne_proxy.tyne_info.kernel_client

    info = {
        "file_name": tyne_proxy.tyne_info.file_name,
        "has_kernel_client": kc is not None,
        "kernel_is_alive": kc is not None and await kc.is_alive(),  # type: ignore
        "subscribers": [
            sub.to_json() for sub in tyne_proxy.kernel_subscribers.values()
        ],
        "connect_lock_acquired": tyne_proxy.tyne_info.connect_lock.locked(),
    }
    if model:
        info["has_tick"] = model.next_tick and model.next_tick > 0

    return info


class LivenessHandler(web.RequestHandler):
    async def get(self) -> None:
        Context.instance().socket(zmq.REQ).close()
        await self.finish("OK")


class UserSelfHandler(SessionMixin, web.RequestHandler):
    def set_default_headers(self) -> None:
        allow_cors(self)

    async def get(self) -> None:
        user = await authenticate_request(self, self.session)
        response = {"capabilities": get_capabilities(user, self.session)}

        if isinstance(user, User):
            response["view_state"] = user.view_state or {}

            org_name = (
                user.organization.organization.name if user.organization else None
            )
            if org_name:
                response["organization"] = {"name": org_name}

        await self.finish(response)

    def options(self, *args: Any, **kwargs: Any) -> None:
        self.set_status(204)
        self.finish()


class TyneNewHandler(TyneHandler):
    async def post(self) -> None:
        new_tyne = await self.tyne_contents_manager.new_tyne(self.session, self.user)
        await self.return_exported(new_tyne.tyne_model, new_tyne.tyne_content)


class TyneGetHandler(TyneHandlerAllowMaintenanceAndAnon):
    async def get(self, tyne_id: str) -> None:
        try:
            tyne = await self.tyne_contents_manager.load_tyne_model(
                tyne_id, self.session, self.user
            )
        except NoSuchTyneError:
            if tyne_id.startswith("file:") and self.application.settings.get(
                "single_user_mode"
            ):
                tyne = (
                    await self.tyne_contents_manager.new_tyne(
                        self.session, self.user, file_name=tyne_id
                    )
                ).tyne_model
            else:
                raise web.HTTPError(404)

        content: TyneContent | None = None
        access_level = get_tyne_access_level(tyne_id, self.session, self.user)
        is_app = tyne.properties and tyne.properties.get("is_app")
        is_in_gallery = tyne.published and tyne.screenshot_url
        # Check for anonymous user. If the user is not logged in (yet) serve up a readonly version of the original:
        if (
            isinstance(self.user, User)
            and access_level == AccessLevel.VIEW
            and (is_app or is_in_gallery)
        ):
            # Published Tyne with only view access, maybe in gallery:
            access_level = AccessLevel.EDIT
            copy_property = "gallery" if is_in_gallery else "published_copied_from"
            # see if we previously copied it:
            tynes = (
                authorized_tyne_query(self.session, self.user)
                .filter(Tyne.tyne_owner_id == self.user.tyne_owner_id)
                .filter(text(f"properties->>'{copy_property}' = '{tyne_id}'"))
                .all()
            )
            if tynes:
                tyne = tynes[0]
            else:
                # copy it
                tyne_model_and_content = await self.tyne_contents_manager.copy_tyne(
                    self.session, tyne_id, tyne.name, user=self.user
                )
                tyne = tyne_model_and_content.tyne_model
                content = tyne_model_and_content.tyne_content
                set_tyne_property(tyne, copy_property, tyne_id)
                if is_app:
                    set_tyne_property(tyne, "app_mode", True)

        if not content:
            content = await self.tyne_contents_manager.tyne_store.load(
                tyne.file_name, self.session
            )

        if isinstance(self.user, User):
            track_tyne_open(self.user, tyne, self.session)

        # Export the database version - the tyne info will catch up:
        await self.return_exported(
            tyne,
            content,
            access=access_level or AccessLevel.VIEW,
        )


class TyneAPIHandler(SessionMixin, web.RequestHandler):
    tyne_file_name: str
    gsheet_id: str | None
    tyne_contents_manager: TyneContentsManager
    kernel_manager: NeptyneKernelService
    tyne_model: Tyne

    def initialize(
        self,
        tyne_contents_manager: TyneContentsManager,
        kernel_manager: NeptyneKernelService,
    ) -> None:
        self.tyne_contents_manager = tyne_contents_manager
        self.kernel_manager = kernel_manager

    def set_default_headers(self) -> None:
        allow_cors(self)

    def options(self, *args: Any, **kwargs: Any) -> None:
        self.set_status(204)
        self.finish()

    async def prepare(self) -> None:
        if self.request.method == "OPTIONS":
            return

        api_key = self.get_argument("apiKey", None)
        tyne_id = self.path_kwargs["tyne_id"]
        if not api_key:
            raise web.HTTPError(403, reason="No API key provided")

        try:
            self.tyne_model = await self.tyne_contents_manager.load_tyne_model(
                tyne_id, self.session, NonUser.ANONYMOUS, api_key=api_key
            )
            self.gsheet_id = (
                self.tyne_model.google_sheet.sheet_id
                if self.tyne_model.google_sheet
                else None
            )
            self.tyne_file_name = self.tyne_model.file_name
        except InvalidAPIKeyError:
            raise web.HTTPError(403, reason="Invalid API key")
        except NoSuchTyneError:
            raise web.HTTPError(
                404, reason="Tyne does not exist, or doesn't match API key"
            )

    async def get(self, tyne_id: str) -> None:
        cell_range = self.get_argument("range")
        if self.tyne_model.google_sheet:
            raise web.HTTPError(
                400, reason="Get API not supported with google sheets. Use POST."
            )

        content = await self.tyne_contents_manager.tyne_store.load(
            self.tyne_model.file_name, self.session
        )
        if "!" in cell_range:
            by_name = content.sheets.sheet_ids_by_name()
            try:
                sheet_id = by_name[cell_range.split("!")[0]]
            except KeyError:
                raise web.HTTPError(400, "no such sheet")
        else:
            sheet_id = 0
        cell_range_object = Range.from_a1(cell_range, sheet_id)

        def value_for_cell(cell: SheetCell | None) -> Any:
            if cell is None:
                return None
            if isinstance(cell.output, Output):
                value = output_to_value(cell.output.data)
            else:
                value = cell.output
            try:
                json.dumps(value)
                return value
            except TypeError:
                return str(value)

        ndim = cell_range_object.dimensions()
        if ndim == 0:
            result = value_for_cell(content.sheets.get(cell_range_object.origin()))
        elif ndim == 1:
            result = [
                value_for_cell(content.sheets.get(addr))
                for row in cell_range_object
                for addr in row
            ]
        else:
            result = [
                [value_for_cell(content.sheets.get(addr)) for addr in row]
                for row in cell_range_object
            ]

        self.set_header("Content-Type", JSON_MIME_KEY)
        await self.finish(json.dumps(result))

    async def post(self, tyne_id: str, function: str | None = None) -> None:
        print(f"API running function: {function}, on tyne: {self.tyne_file_name}")

        method_regex = r"^[a-zA-Z_][a-zA-Z0-9_]*$"

        if function:
            if not re.match(method_regex, function):
                raise web.HTTPError(400, "Invalid function name")

        if await maybe_forward_request_to_owner(
            self, self.tyne_contents_manager, self.tyne_file_name
        ):
            return

        tyne_proxy = await self.tyne_contents_manager.get(
            self.tyne_file_name,
            self.session,
            NonUser.ANONYMOUS,
            api_key=self.get_argument("apiKey"),
        )
        if not tyne_proxy:
            raise web.HTTPError(404, "Tyne does not exist")

        session_id = uuid4().hex

        load_init_data = self.tyne_contents_manager.init_data_loader(
            self.tyne_file_name, self.make_session
        )

        async def on_kernel_msg(stream: Any, msg: dict[str, Any]) -> None:
            if msg["msg_type"] == MessageTypes.USER_API_RESPONSE_STREAM.value:
                content = msg["content"]
                if content["session_id"] == session_id:
                    self.set_header("Content-Type", JSON_MIME_KEY)
                    content = {**content}
                    content.pop("session_id")
                    self.write(json.dumps(content))
                    await self.flush()

        subscriber = KernelSubscriber(
            on_kernel_msg=on_kernel_msg,
            user_email="",
            user_name="",
            user_profile_image="",
            close=lambda: None,
        )

        await tyne_proxy.connect_to_kernel(
            self.kernel_manager,
            load_init_data,
            timeout=300,
            session_id=session_id,
            subscriber=subscriber,
        )

        query_args = dict(self.request.query_arguments)
        query_args.pop("apiKey")
        code = (
            f"N_.execute_user_server_method("
            f"{session_id!r}, "
            f"{function!r}, "
            f"{self.request.body!r}, "
            f"{dict(self.request.headers)!r}, "
            f"{query_args!r}, "
            ")"
        )
        try:
            await tyne_proxy.tyne_info.execute_and_wait(
                None,
                code,
                reason="API call",
                timeout=60,
                tyne_secrets=tyne_proxy.get_tyne_secrets(),
                skip_input_transformers=True,
                user_api_token=None,
            )
        finally:
            tyne_proxy.update_kernel_subscriber(session_id, None)


class TyneAPIKeyHandler(TyneHandler):
    async def get_tyne_id(self) -> int:
        gsheet_token = self.request.headers.get("X-Neptyne-Gsheet-Auth-Token", "")
        assert isinstance(gsheet_token, str)
        decoded_token = decode_gsheet_extension_token(gsheet_token)
        with self.make_session() as session:
            _, tyne_model = await get_or_create_tyne_for_sheet(
                self.tyne_contents_manager,
                decoded_token.sheet_id,
                decoded_token.tyne_file_name,
                session,
                decoded_token.owner_email,
                NonUser.GSHEET,
                return_content=False,
            )
            return tyne_model.id

    async def get(self) -> None:
        tyne_id = await self.get_tyne_id()
        api_key = self.session.query(APIKey).filter(APIKey.tyne_id == tyne_id).first()
        await self.finish({"key": api_key.key if api_key else ""})

    async def put(self) -> None:
        tyne_id = await self.get_tyne_id()
        api_key = self.session.query(APIKey).filter(APIKey.tyne_id == tyne_id).first()

        if not api_key:
            api_key = APIKey(user_id=self.user.id, tyne_id=tyne_id, key=str(uuid4()))
            self.session.add(api_key)
            self.session.commit()
        await self.finish({"key": api_key.key})

    async def delete(self) -> None:
        tyne_id = await self.get_tyne_id()
        self.session.query(APIKey).filter(APIKey.tyne_id == tyne_id).delete()
        await self.finish({})


class TyneDownloadHandler(TyneHandler):
    async def get(
        self, tyne_id: str, fmt: str = "json", sheet_id: str | None = None
    ) -> None:
        with self.make_session() as session:
            tyne = await self.tyne_contents_manager.load_tyne_model(
                tyne_id, session, self.user
            )
            if not tyne:
                raise web.HTTPError(404)
            contents: bytes | str
            if fmt == "xlsx":
                content = await self.tyne_contents_manager.tyne_store.load(
                    tyne_id, session
                )
                sheets = content.sheets
                contents = self.tyne_contents_manager.export_xlsx(
                    sheets, tyne.properties
                )
                content_type = (
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                )
            elif fmt == "csv":
                content = await self.tyne_contents_manager.tyne_store.load(
                    tyne_id, session
                )
                sheets = content.sheets
                try:
                    sid = int(sheet_id)  # type: ignore
                except ValueError:
                    sid = 0
                contents = self.tyne_contents_manager.export_csv(sheets, sid)
                content_type = "text/csv"
            else:
                # JSON by default
                # TODO: make this work with the tyne store. Consider format change?
                contents = json.dumps(tyne.to_dict(), indent=2)
                content_type = JSON_MIME_KEY

        self.set_header("Content-Type", content_type)
        await self.finish(contents)


class GallerySyncHandler(TyneHandler):
    async def prepare(self) -> None:
        await super().prepare()
        if not self.user.email.endswith("@neptyne.com"):
            raise web.HTTPError(403)

    async def post(self) -> None:
        def tyne_id_from_url(url: str) -> str:
            o = urlparse(url)
            return o.path.rsplit("/", 1)[-1]

        with self.make_session() as session:
            gallery: list[dict] = json.loads(self.request.files["gallery"][0]["body"])
            tyne_ids = [tyne_id_from_url(tyne["url"]) for tyne in gallery]

            to_drop = (
                session.query(Tyne)
                .filter(Tyne.published == true())
                .filter(Tyne.screenshot_url.is_not(None))
                .filter(not_(Tyne.file_name.in_(tyne_ids)))
                .all()
            )

            for tyne in to_drop:
                tyne.screenshot_url = None
                session.add(tyne)

            missing: list[tuple[str, str]] = []

            for tyne_id, item in zip(tyne_ids, gallery):
                try:
                    tyne = await self.tyne_contents_manager.load_tyne_model(
                        tyne_id, session, self.user
                    )
                except NoSuchTyneError:
                    missing.append((tyne_id, item["Tyne"]))
                    continue

                tyne.screenshot_url = item["Image"]
                tyne.published = True
                set_tyne_property(tyne, "description", item["Description"])
                set_tyne_property(tyne, "gallery_category", item["Category"])
                session.add(tyne)

        self.set_header("Content-Type", "text/text")
        msg = f"Now {len(gallery)} tyne(s) in the gallery."
        if missing:
            msg += f" Missing: {', '.join(f'{tyne_name} ({tyne_id})' for tyne_id, tyne_name in missing)}."
        if to_drop:
            msg += f" Dropped {len(to_drop)} items."
        await self.finish(msg)

    async def delete(self, tyne_id: str) -> None:
        with self.make_session() as session:
            tyne_info = await self.tyne_contents_manager.get(
                tyne_id, session, self.user
            )
            if not tyne_info:
                raise web.HTTPError(404)
            tyne = await self.tyne_contents_manager.load_tyne_model(
                tyne_id, session, self.user
            )
            tyne.screenshot_url = None
            session.add(tyne)
        self.set_header("Content-Type", "text/text")
        await self.finish("ok")


class TyneListHandler(TyneHandler):
    async def get(self) -> None:
        with self.make_session() as session:
            user = self.user
            owned_tynes = user.tyne_owner.tynes
            tynes_shared = user.shared_tynes

            tyne_opens = {
                tyne_user.tyne_id: tyne_user.last_opened
                for tyne_user in session.query(TyneUser)
                .filter(TyneUser.user_id == user.id)
                .all()
            }

            published_tynes = (
                session.query(Tyne)
                .filter(Tyne.published == true())
                .filter(Tyne.screenshot_url.is_not(None))
                .filter(Tyne.in_gallery == true())
                .filter(
                    not_(
                        Tyne.id.in_(
                            [tyne.id for tyne in owned_tynes]
                            + [tyne.tyne_id for tyne in tynes_shared]
                        )
                    )
                )
                .all()
            )

            def tyne_to_dict(tyne: Tyne, access: AccessLevel | str) -> dict[str, Any]:
                categories = []
                if access == AccessLevel.EDIT:
                    categories.append(TyneCategories.EDITABLE_BY_ME)
                tyne_owner = tyne.tyne_owner
                if tyne_owner.user and tyne_owner.user.id == user.id:
                    categories.append(TyneCategories.AUTHORED_BY_ME)
                else:
                    categories.append(TyneCategories.SHARED_WITH_ME)
                if tyne.in_gallery and tyne.screenshot_url:
                    categories.append(TyneCategories.IN_GALLERY)
                    name = "Neptyne"
                    owner_profile_image = "https://app.neptyne.com/img/emblem.jpg"
                    email = "neptyne@neptyne.com"
                else:
                    if tyne_owner.user:
                        email = tyne_owner.user.email
                        name = tyne_owner.user.name or email
                    else:
                        name = "Unknown"
                        email = None
                    owner_profile_image = None
                properties = tyne.properties or {}

                return TyneListItem(
                    name=tyne.name,
                    description=properties.get("description"),
                    owner=name or "",
                    owner_profile_image=owner_profile_image,
                    owner_color=email_to_color(email),
                    access=access if isinstance(access, str) else access.value,
                    categories=categories,
                    file_name=tyne.file_name,
                    last_modified=tyne.last_modified.astimezone(),
                    gallery_screenshot_url=tyne.screenshot_url,
                    gallery_category=properties.get("gallery_category"),
                    last_opened=(
                        tyne_opens[tyne.id].astimezone()
                        if tyne.id in tyne_opens
                        else None
                    ),
                ).to_dict()

            as_dicts = sorted(
                [tyne_to_dict(tyne, access=AccessLevel.EDIT) for tyne in owned_tynes]
                + [
                    tyne_to_dict(
                        tyne_shared.tyne,
                        access=tyne_shared.access_level,
                    )
                    for tyne_shared in tynes_shared
                ]
                + [tyne_to_dict(tyne, access="PUBLIC") for tyne in published_tynes],
                key=lambda rec: rec["lastModified"],
                reverse=True,
            )
        contents = json.dumps({"tynes": as_dicts})

        self.set_header("Content-Type", JSON_MIME_KEY)
        await self.finish(contents)


class TyneRenameHandler(TyneHandler):
    async def get(self, tyne_id: str) -> None:
        with self.make_session() as session:
            new_name = self.get_argument("new_name", None)
            if new_name:
                try:
                    tyne_model = await self.tyne_contents_manager.load_tyne_model(
                        tyne_id, session, self.user
                    )
                except NoSuchTyneError:
                    raise web.HTTPError(404)
                tyne_model.name = new_name
                session.add(tyne_model)
                session.commit()
        self.set_header("Content-Type", "text/text")
        await self.finish("ok")


class TyneFileRenameHandler(SessionMixin, web.RequestHandler):
    tyne_contents_manager: TyneContentsManager

    def initialize(self, tyne_contents_manager: TyneContentsManager) -> None:
        self.tyne_contents_manager = tyne_contents_manager

    async def put(self, tyne_id: str) -> None:
        with self.make_session() as session:
            new_name = self.get_argument("new_file_name", None)
            if new_name:
                try:
                    self.tyne_contents_manager.file_rename(tyne_id, new_name, session)
                except NoSuchTyneError:
                    raise web.HTTPError(404)
        self.set_header("Content-Type", "text/text")
        await self.finish("ok")


class TyneImportHandler(TyneHandler):
    async def post(self) -> None:
        file_info = self.request.files["notebook"][0]
        basename, extension = os.path.splitext(file_info["filename"])
        if extension not in (".ipynb", ".json", ".xlsx"):
            raise web.HTTPError(404)

        if extension == ".ipynb":
            imported_tyne = await self.tyne_contents_manager.import_notebook_ipynb(
                self.session, json.loads(file_info["body"]), basename, self.user
            )
        elif extension == ".xlsx":
            imported_tyne = await self.tyne_contents_manager.import_xlsx(
                self.session, file_info["body"], basename, self.user
            )
        else:
            imported_tyne = await self.tyne_contents_manager.import_tyne_json(
                self.session, json.loads(file_info["body"]), basename, self.user
            )
        await self.return_exported(imported_tyne.tyne_model, imported_tyne.tyne_content)


class TyneImportGoogleHandler(TyneHandler):
    async def post(self) -> None:
        url = self.get_argument("url")
        oauth_access = json.loads(self.get_argument("authPayload"))
        expiry = (
            datetime.utcnow() + timedelta(seconds=oauth_access["expires_in"])
        ).isoformat()
        credentials = Credentials.from_authorized_user_info(
            {
                **oauth_access,
                "token": oauth_access["access_token"],
                "expiry": expiry,
                "refresh_token": None,
                "client_id": None,
                "client_secret": None,
            },
            scopes=[
                "https://www.googleapis.com/auth/drive.file",
            ],
        )
        imported_tyne = await self.tyne_contents_manager.import_google_sheet(
            self.session,
            url,
            user=self.user,
            credentials=credentials,
        )
        await self.return_exported(imported_tyne.tyne_model, imported_tyne.tyne_content)


class TyneFileUploadHandler(TyneHandler):
    async def post(self) -> None:
        tyne_file_name = self.request.arguments["tyne_file_name"][0].decode()
        if "gsheet_auth_token" in self.request.arguments:
            gsheet_auth_token = self.request.arguments["gsheet_auth_token"][0].decode()
        else:
            gsheet_auth_token = None

        tyne_info = await self.tyne_contents_manager.get(
            tyne_file_name, self.session, self.user, gsheet_auth_token=gsheet_auth_token
        )
        if tyne_info is None:
            raise web.HTTPError(404)
        if "contents" in self.request.files:
            file_obj = self.request.files["contents"][0]
            file_content = file_obj.body
            file_name = file_obj.filename
            tyne_info.stream_file(file_content, file_name)
        else:
            tyne_info.cancel_stdin()


class TyneCopyHandler(TyneHandler):
    async def post(self, tyne_id: str) -> None:
        new_name_arg = self.request.arguments.get("name", [None])[0]
        if new_name_arg is None:
            tyne_id = self.request.arguments["copyTyneId"][0].decode("utf-8")
            new_name = None
        else:
            new_name = new_name_arg.decode("utf-8")
        copied_tyne = await self.tyne_contents_manager.copy_tyne(
            self.session, tyne_id, new_name, user=self.user
        )
        await self.return_exported(copied_tyne.tyne_model, copied_tyne.tyne_content)


class TyneCopyIfReadonlyHandler(TyneHandler):
    async def post(self, tyne_id: str) -> None:
        if get_tyne_access_level(tyne_id, self.session, self.user) == AccessLevel.EDIT:
            tyne_model = await self.tyne_contents_manager.load_tyne_model(
                tyne_id, self.session, self.user
            )
            tyne_content = await self.tyne_contents_manager.tyne_store.load(
                tyne_id, self.session
            )
        else:
            new_name = self.request.arguments["name"][0].decode("utf8")
            copied_tyne = await self.tyne_contents_manager.copy_tyne(
                self.session, tyne_id, new_name, user=self.user
            )
            tyne_model = copied_tyne.tyne_model
            tyne_content = copied_tyne.tyne_content
        await self.return_exported(tyne_model, tyne_content)


class TyneDeleteHandler(TyneHandler):
    async def post(self, tyne_id: str) -> None:
        await self.tyne_contents_manager.delete_tyne(
            self.session, tyne_id, user=self.user
        )
        self.set_header("Content-Type", "text/text")
        await self.finish("ok")


class NeptyneRedirectHandler(web.RequestHandler):
    def get(self, tyne_id: str = "") -> None:
        self.redirect(f"/-/{tyne_id}")


class TyneSecretsHandler(TyneHandler):
    async def get(self, tyne_id: str) -> None:
        auth_token = self.request.headers.get("X-Neptyne-GSheet-Auth-Token")
        tyne_info = await self.tyne_contents_manager.get(
            tyne_id, self.session, self.user, gsheet_auth_token=auth_token
        )
        if not tyne_info:
            raise web.HTTPError(404)

        tyne_info.load_user_secrets(self.user.id, self.session)
        tyne_info.load_user_secrets(None, self.session)
        user_secrets = tyne_info.user_secrets.get(self.user.id, {})
        tyne_secrets = tyne_info.user_secrets.get(None, {})

        self.set_header("Content-Type", JSON_MIME_KEY)
        await self.finish(json.dumps({"user": user_secrets, "tyne": tyne_secrets}))


class TyneEnvironmentHandler(TyneHandler):
    def set_default_headers(self) -> None:
        allow_cors(self)

    async def get(self, tyne_file_name: str) -> None:
        auth_token = self.request.headers.get("X-Neptyne-GSheet-Auth-Token")
        tyne_file_name = self.resolve_tyne_file_name(tyne_file_name)
        model = await self.tyne_contents_manager.load_tyne_model(
            tyne_file_name,
            self.session,
            self.user,
            gsheet_auth_token=auth_token,
        )
        if not model:
            raise web.HTTPError(404)
        await self.finish(model.environment_variables or {})

    @forward_to_owner
    async def put(self, tyne_file_name: str) -> None:
        auth_token = self.request.headers.get("X-Neptyne-GSheet-Auth-Token")
        tyne_file_name = self.resolve_tyne_file_name(tyne_file_name)
        model = await self.tyne_contents_manager.load_tyne_model(
            tyne_file_name,
            self.session,
            self.user,
            gsheet_auth_token=auth_token,
        )
        if not model:
            raise web.HTTPError(404)
        variables = json_decode(self.request.body)
        if len(variables) > 100:
            raise web.HTTPError(400, "Too many environment variables")
        if any(len(k) > 1024 or len(v) > 1024 * 1024 for k, v in variables.items()):
            raise web.HTTPError(400, "Environment variable key or value too long")
        model.environment_variables = {k: v for k, v in variables.items() if k}
        self.session.add(model)
        self.session.commit()
        if tyne_proxy := self.tyne_contents_manager.tynes.get(tyne_file_name):
            tyne_proxy.tyne_info.reload_env(None, variables)
        await self.finish("ok")

    def options(self, *args: Any, **kwargs: Any) -> None:
        self.set_status(204)
        self.finish()


class KernelListHandler(SessionMixin, web.RequestHandler):
    kernel_manager: NeptyneKernelService

    def initialize(self, kernel_manager: NeptyneKernelService) -> None:
        self.kernel_manager = kernel_manager

    async def get(self) -> None:
        kernels: list[dict] = []
        for kernel_id, kernel in self.kernel_manager.kernels.items():
            model = self.kernel_manager.kernel_model(kernel_id)
            provisioner_info: dict[str, Any] = {}
            if hasattr(kernel, "provisioner") and kernel.provisioner:
                provisioner_info = await kernel.provisioner.get_provisioner_info()
                if key := provisioner_info.get("connection_info", {}).get("key"):
                    if isinstance(key, bytes):
                        provisioner_info["connection_info"]["key"] = key.decode("utf-8")
            kernels.append(
                {
                    **model,
                    "provisioner": provisioner_info,
                }
            )

        self.set_header("Content-Type", JSON_MIME_KEY)
        await self.finish({"kernels": kernels})


class TyneManagerDebugHandler(SessionMixin, web.RequestHandler):
    tyne_contents_manager: TyneContentsManager

    def initialize(self, tyne_contents_manager: TyneContentsManager) -> None:
        self.tyne_contents_manager = tyne_contents_manager

    async def get(self) -> None:
        tyne_infos = []

        tyne_file_names = [*self.tyne_contents_manager.tynes]

        tyne_models = {}
        for (model,) in self.session.execute(
            select(Tyne).filter(Tyne.file_name.in_(tyne_file_names))
        ):
            tyne_models[model.file_name] = model

        for tyne_file_name, tyne_proxy in self.tyne_contents_manager.tynes.items():
            tyne_infos.append(
                await export_debug_info(tyne_proxy, tyne_models.get(tyne_file_name))
            )

        self.set_header("Content-Type", JSON_MIME_KEY)
        await self.finish(json.dumps({"tynes": tyne_infos}))


class TyneDebugHandler(SessionMixin, web.RequestHandler):
    tyne_contents_manager: TyneContentsManager

    def initialize(
        self,
        tyne_contents_manager: TyneContentsManager,
    ) -> None:
        self.tyne_contents_manager = tyne_contents_manager

    async def get(self, tyne_id: str) -> None:
        try:
            tyne_proxy = self.tyne_contents_manager.tynes[tyne_id]
        except KeyError:
            # only return tynes from the cache
            raise web.HTTPError(404)

        model = self.session.execute(
            select(Tyne).filter(Tyne.file_name == tyne_id)
        ).scalar_one_or_none()

        self.set_header("Content-Type", JSON_MIME_KEY)
        await self.finish(json.dumps(await export_debug_info(tyne_proxy, model)))

    async def delete(self, tyne_id: str) -> None:
        """Disconnect a tyne and remove it from the cache. Any clients will need to refresh."""
        try:
            tyne_proxy = self.tyne_contents_manager.tynes[tyne_id]
        except KeyError:
            # only return tynes from the cache
            raise web.HTTPError(404)

        tyne_proxy.disconnect()
        tyne_proxy.disconnect_clients()
        del self.tyne_contents_manager.tynes[tyne_id]

        await self.finish("ok")


class BrowseCacheHandler(TyneHandler):
    tyne_contents_manager: TyneContentsManager

    def initialize(self, tyne_contents_manager: TyneContentsManager) -> None:
        self.tyne_contents_manager = tyne_contents_manager

    async def prepare(self) -> None:
        await super().prepare()
        if not self.user.email.endswith("@neptyne.com"):
            raise web.HTTPError(403)

    async def get(self, tyne_id: str | None) -> None:
        try:
            limit = int(self.get_argument("limit", "100"))
        except ValueError:
            raise HTTPError(400, "limit must be an integer")

        before: datetime | None = None
        if before_s := self.get_argument("before", None):
            try:
                before = datetime.fromisoformat(before_s)
            except ValueError:
                raise HTTPError(400, "before must be an ISO datetime string")

        file_name = self.get_argument("file_name", None)

        recent_tynes_query = (
            self.session.query(
                FunctionCallCache.tyne_id,
                Tyne.file_name,
                func.max(FunctionCallCache.date).label("recent_date"),
            )
            .join(Tyne, FunctionCallCache.tyne_id == Tyne.id)
            .group_by(FunctionCallCache.tyne_id, Tyne.file_name)
            .order_by(desc("recent_date"))
        )
        if file_name:
            recent_tynes_query = recent_tynes_query.filter(Tyne.file_name == file_name)
        elif before:
            recent_tynes_query = recent_tynes_query.having(
                func.max(FunctionCallCache.date) < before
            )
        recent_tynes = {
            tyne.tyne_id: {
                "tyne_id": tyne.tyne_id,
                "tyne_file_name": tyne.file_name,
                "date": tyne.recent_date.isoformat(),
                "codePanels": [],
            }
            for tyne in recent_tynes_query.limit(limit).all()
        }

        total = self.session.query(
            func.count(func.distinct(FunctionCallCache.tyne_id))
        ).scalar()

        try:
            tyne_id_int = int(tyne_id)  # type: ignore
            cache_entries = (
                self.session.query(FunctionCallCache)
                .filter(FunctionCallCache.tyne_id == tyne_id_int)
                .order_by(FunctionCallCache.date.desc())
                .all()
            )

            code_panels = recent_tynes[tyne_id_int]["codePanels"]
            for entry in cache_entries:
                if not code_panels or code_panels[-1]["code_panel"] != entry.code_panel:
                    code_panels.append(
                        {
                            "code_panel": entry.code_panel,
                            "executions": [],
                        }
                    )
                code_panels[-1]["executions"].append(
                    {
                        "date": entry.date.isoformat(),
                        "expression": entry.expression,
                        "result": entry.result,
                    }
                )
        except (KeyError, ValueError):
            pass

        await self.finish(
            {
                "page": [*recent_tynes.values()],
                "pageSize": limit,
                "total": total,
            }
        )


class DisableTickHandler(SessionMixin, web.RequestHandler):
    tyne_contents_manager: TyneContentsManager

    def initialize(
        self,
        tyne_contents_manager: TyneContentsManager,
        kernel_manager: NeptyneKernelService,
    ) -> None:
        self.tyne_contents_manager = tyne_contents_manager
        self.kernel_manager = kernel_manager

    async def delete(self, tyne_id: str) -> None:
        """Forcibly disable a tyne's ticking cell(s). If the tyne is opened and resaved, the tick
        will be re-enabled."""
        try:
            await self.tyne_contents_manager.disable_tick(
                self.session, tyne_id, self.kernel_manager
            )
        except WrongShardError:
            raise web.HTTPError(400, "wrong shard index")

        await self.finish("ok")


class ResearchHandler(SessionMixin, web.RequestHandler):
    def options(self, *args: Any, **kwargs: Any) -> None:
        self.set_status(204)
        self.finish()

    def set_default_headers(self) -> None:
        allow_cors(self)

    async def post(self) -> None:
        await authenticate_request(
            self,
            self.session,
        )
        payload = json.loads(self.request.body)
        prompt = payload.get("prompt")
        research_table = payload.get("researchTable")
        if prompt is None or research_table is None:
            raise web.HTTPError(400, "prompt and headers are required")

        host = os.getenv("API_PROXY_SERVICE_HOST", "localhost")
        port = os.getenv("API_PROXY_SERVICE_PORT", "8888")
        host_port = f"{host}:{port}"

        args = json.dumps([prompt, research_table])
        encoded_args = urllib.parse.urlencode({"args": args})
        url = f"http://{host_port}/research/research_dataset?{encoded_args}"

        headers_written = False

        try:
            async with aiohttp.ClientSession(
                timeout=ClientTimeout(RESEARCH_TIMEOUT)
            ) as session:
                async with session.post(
                    url, json={"args": args}, headers={"Authorization": None}
                ) as response:
                    async for chunk in response.content:
                        if not headers_written:
                            headers_written = True
                            self.set_header("Content-Type", "application/json")
                            await self.flush()
                        print(">>", chunk)
                        self.write(chunk)
                        await self.flush()
        except aiohttp.ClientError as e:
            self.write(json.dumps({"error": str(e)}))

        print("Done!")


def update_existing_tokens(session: Session, old_token: str, new_token: str) -> None:
    if old_token and new_token and old_token != new_token:
        statement = (
            update(Tyne)
            .where(Tyne.gsheets_refresh_token == old_token)
            .values(gsheets_refresh_token=new_token)
        )
        session.execute(statement)


class OauthHandler(SessionMixin, web.RequestHandler):
    def set_default_headers(self) -> None:
        allow_cors(self)

    async def get(self) -> None:
        CLIENT_ID = os.getenv("GSHEETS_OAUTH_CLIENT_ID")
        CLIENT_SECRET = os.getenv("GSHEETS_OAUTH_CLIENT_SECRET")

        original_proto = self.request.headers.get(
            "X-Forwarded-Proto", self.request.protocol
        ).split(",")[0]

        original_host = self.request.headers.get("X-Forwarded-Host", self.request.host)
        REDIRECT_URI = original_proto + "://" + original_host + self.request.path

        SCOPES = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive.file",
        ]

        state = self.get_argument("state")
        assert state

        payload = json.loads(state)
        try:
            claim = decode_gsheet_extension_token(payload["authToken"])
        except jwt.exceptions.InvalidTokenError:
            raise web.HTTPError(400, "invalid token")

        if payload.get("action") == "status":
            authenticated = False
            with self.make_session() as session:
                firebase_user = (
                    session.query(FirebaseUser)
                    .filter(FirebaseUser.firebase_uid == payload["firebaseUid"])
                    .first()
                )
                if firebase_user and (
                    refresh_token := firebase_user.user.gsheets_refresh_token
                ):
                    try:
                        await get_access_token(refresh_token)
                        authenticated = True
                    except InvalidTokenError:
                        pass
            self.set_header("Content-Type", "application/json")
            await self.finish(json.dumps({"authenticated": authenticated}))
            return

        client_config = {
            "web": {
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "redirect_uris": [REDIRECT_URI],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://accounts.google.com/o/oauth2/token",
                "access_type": "offline",
            }
        }

        flow = Flow.from_client_config(
            client_config, scopes=SCOPES, redirect_uri=REDIRECT_URI
        )

        if code := self.get_argument("code", None):
            try:
                flow.fetch_token(code=code)
            except OAuth2Error as e:
                raise web.HTTPError(
                    e.status_code, f"oauth error: {e.error}: {e.description}"
                )
            refresh_token = flow.credentials.refresh_token

            with self.make_session() as session:
                firebase_user = (
                    session.query(FirebaseUser)
                    .filter(FirebaseUser.firebase_uid == payload["firebaseUid"])
                    .first()
                )
                if firebase_user:
                    user = firebase_user.user
                    assert user.email == claim.user_email
                    if user.gsheets_refresh_token:
                        update_existing_tokens(
                            session, user.gsheets_refresh_token, refresh_token
                        )
                    user.gsheets_refresh_token = refresh_token
                    session.add(user)
                session.commit()
            self.set_header("Content-Type", "text/html")
            await self.finish(
                "<html><head>\n"
                "<script type='text/javascript'>\n"
                "      window.onload = function() {\n"
                "         window.close();\n"
                "      }"
                "</script>\n"
                "</head><body>\n"
                "<p>Google Sheets access granted. You can close this window.</p>\n"
                "</body></html>\n"
            )
        else:
            authorization_url, _ = flow.authorization_url(
                access_type="offline", state=state
            )
            self.redirect(authorization_url + "&prompt=consent")

    async def delete(self) -> None:
        state = self.get_argument("state")
        assert state
        payload = json.loads(state)
        claim = decode_gsheet_extension_token(payload["authToken"])

        with self.make_session() as session:
            firebase_user = (
                session.query(FirebaseUser)
                .filter(FirebaseUser.firebase_uid == payload["firebaseUid"])
                .first()
            )
            if (
                firebase_user
                and (user := firebase_user.user)
                and (refresh_token := user.gsheets_refresh_token)
            ):
                assert user.email == claim.user_email
                user.gsheets_refresh_token = None
                session.add(user)
                session.commit()
            else:
                await self.finish("nothing to do")
                return

        revoke_url = "https://oauth2.googleapis.com/revoke"
        params = {"token": refresh_token}

        async with aiohttp.ClientSession() as session:
            async with session.post(revoke_url, params=params) as response:
                if response.status != 200:
                    response_text = await response.text()
                    print("Failed to revoke token:", response_text)

    def options(self, *args: Any, **kwargs: Any) -> None:
        self.set_status(204)
        self.finish()


class APIQuotasHandler(SessionMixin, web.RequestHandler):
    api_quota_manager: APIQuotaManager

    def initialize(
        self,
        api_quota_manager: APIQuotaManager,
    ) -> None:
        self.api_quota_manager = api_quota_manager

    async def get(self) -> None:
        user = await authenticate_request(self, self.session)
        quotas = self.api_quota_manager.get_all(self.session, user.id)
        self.set_header("Content-Type", JSON_MIME_KEY)
        await self.finish({"quotas": quotas})


class ViewStateHandler(SessionMixin, web.RequestHandler):
    supported_keys = ("showGetStartedOnNewSheet", "latestReleaseNotesViewed")

    def set_default_headers(self) -> None:
        allow_cors(self)

    async def put(self) -> None:
        user = await authenticate_request(
            self,
            self.session,
        )

        if not isinstance(user, User):
            raise web.HTTPError(403)

        view_state = json.loads(self.request.body)
        if not user.view_state:
            user.view_state = {}
        validated = UserViewState.from_dict(view_state).to_dict()
        for key, value in validated.items():
            user.view_state[key] = value
            flag_modified(user, "view_state")
        self.set_header("Content-Type", "text/text")
        await self.finish("ok")

    def options(self, *args: Any, **kwargs: Any) -> None:
        self.set_status(204)
        self.finish()


class AISnippetHandler(SessionMixin, web.RequestHandler):
    def set_default_headers(self) -> None:
        allow_cors(self)

    async def post(self) -> None:
        await authenticate_request(
            self,
            self.session,
        )
        payload = json.loads(self.request.body)
        user_prompt = payload["prompt"]
        sheet_data = (
            SheetData.from_dict(payload["sheetData"]) if payload["sheetData"] else None
        )
        print("AI Snippet user prompt:", user_prompt)

        result = await ai_snippet_reply(user_prompt, sheet_data)
        if result:
            self.set_header("Content-Type", JSON_MIME_KEY)
            msg, code = result
            await self.finish(json.dumps({"msg": msg, "code": code}))
        else:
            await self.finish(None)

    def options(self, *args: Any, **kwargs: Any) -> None:
        self.set_status(204)
        self.finish()


class ReleaseNotesHandler(web.RequestHandler):
    release_notes_markdown_path = str(Path(__file__).parent.parent / "release_notes.md")

    def set_default_headers(self) -> None:
        allow_cors(self)

    async def get(self) -> None:
        fmt = self.get_argument("format", None)
        if fmt != "markdown":
            raise web.HTTPError(400, "invalid format")
        await self.render(self.release_notes_markdown_path)


class HowManyShardsHandler(SessionMixin, web.RequestHandler):
    num_shards: int

    def initialize(self, num_shards: int) -> None:
        self.num_shards = num_shards

    async def get(self) -> None:
        self.set_header("Content-Type", JSON_MIME_KEY)
        data = {"num_shards": self.num_shards}
        if key := self.get_argument("api_key", None):
            with self.make_session() as session:
                api_key = session.query(APIKey).filter_by(key=key).first()
                if api_key:
                    data["shard_index"] = shard_id(
                        api_key.tyne.file_name, self.num_shards
                    )
        await self.finish(data)


BUILD_DIR = os.path.join(os.getcwd(), "frontend", "build")


class IndexHandler(web.RequestHandler):
    def get(self, *args: Any, **kwargs: Any) -> None:
        # Serve the index.html file as a fallback
        self.render(os.path.join(BUILD_DIR, "index.html"))
        # self.render("../../frontend/build/index.html")


def create_neptyne_app(
    tyne_contents_manager: TyneContentsManager,
    kernel_connection_dir: str | Path,
    db: SQLAlchemy,
    *,
    debug: bool = False,
    single_user_mode: bool = False,
    shared_secret: str | None = None,
) -> tuple[web.Application, NeptyneKernelService]:
    kernel_spec_manager = NeptyneKernelSpecManager()
    kernel_connection_dir = Path(kernel_connection_dir)
    kernel_connection_dir.mkdir(exist_ok=True)

    pod_pool: KernelPodPool | None = None
    api_client: ApiClient | None = None

    Context.instance().set(zmq.MAX_SOCKETS, 65536)

    kernel_manager = NeptyneKernelService(
        namespace=os.getenv("KERNEL_NAMESPACE", "default"),
        pod_pool=pod_pool,
        k8s_client=api_client,
        kernel_spec_manager=kernel_spec_manager,
        connection_dir=kernel_connection_dir.as_posix(),
    )

    if debug:
        enable_pretty_logging()

    KernelProvisionerFactory.instance().provisioners["neptyne-k8s"] = (
        k8s.NeptyneK8sProvisioner
    )
    KernelProvisionerFactory.instance().provisioners["local-provisioner"] = (
        NeptyneLocalProvisioner
    )

    client_config = {
        "enableAnalytics": bool(os.getenv("ENABLE_ANALYTICS")),
        "gitSHA": os.getenv("GIT_SHA") or "unknown",
    }

    feature_flags = FeatureFlags()

    api_quota_manager = APIQuotaManager()

    sheet_linter_executor = ProcessPoolExecutor(max_workers=2)
    streamlit_session_store: set[str] = set()

    return (
        web.Application(
            [
                (r"/livez", LivenessHandler),
                # Used to connect a websocket to a kennel. Pick your own session id
                (
                    r"/ws/\d+/api/kernels/(?P<tyne_id>.*)/channels",
                    TyneWebsocketHandler,
                    {
                        "kernel_manager": kernel_manager,
                        "tyne_contents_manager": tyne_contents_manager,
                    },
                ),
                (
                    r"/ws/\d+/api/sl-app/[a-zA-Z0-9]+/?",
                    StreamlitGuestMainHandler,
                ),
                (
                    r"/ws/\d+/api/sl-app/(?P<tyne_id>.*)/_stcore/stream",
                    StreamlitWebsocketHandler,
                    {
                        "kernel_manager": kernel_manager,
                        "tyne_contents_manager": tyne_contents_manager,
                    },
                ),
                (
                    r"/ws/\d+/api/sl-app/(.*)/_stcore/host-config",
                    StreamlitHostConfigHandler,
                ),
                (
                    r"/ws/\d+/api/sl-app/(?P<tyne_id>.*)/_stcore/health",
                    StreamlitHealthHandler,
                ),
                (
                    r"/ws/\d+/api/sl-app/(.*)/_stcore/(.*)",
                    StreamlitProxyHandler,
                    {
                        "kernel_manager": kernel_manager,
                    },
                ),
                (
                    r"/ws/\d+/api/sl-app/([^/]+)/media/(.*)",
                    StreamlitProxyHandler,
                    {
                        "kernel_manager": kernel_manager,
                    },
                ),
                (
                    r"/ws/\d+/api/sl-app/([^/]+)/component/(.*)",
                    StreamlitProxyHandler,
                    {
                        "kernel_manager": kernel_manager,
                    },
                ),
                (
                    r"/ws/\d+/api/sl-app/([^/]+)/app/static/(.*)",
                    StreamlitProxyHandler,
                    {
                        "kernel_manager": kernel_manager,
                    },
                ),
                (
                    r"/ws/\d+/api/sl-app/[^/]+/(?P<path>.*)",
                    StyleInjectingStaticHandler,
                    {
                        "path": "%s/" % get_static_dir(),
                        "default_filename": "index.html",
                    },
                ),
                (
                    r"/apps/(?P<tyne_id>.*)",
                    StreamlitHostMainHandler,
                    {
                        "tyne_contents_manager": tyne_contents_manager,
                    },
                ),
                (
                    r"/api/tyne_new",
                    TyneNewHandler,
                    {"tyne_contents_manager": tyne_contents_manager},
                ),
                (
                    r"/api/tyne_get/(?P<tyne_id>.*)",
                    TyneGetHandler,
                    {"tyne_contents_manager": tyne_contents_manager},
                ),
                (
                    r"/api/tyne_rename/(?P<tyne_id>.*)",
                    TyneRenameHandler,
                    {"tyne_contents_manager": tyne_contents_manager},
                ),
                (
                    r"/api_internal/tyne_file_rename/(?P<tyne_id>.*)",
                    TyneFileRenameHandler,
                    {"tyne_contents_manager": tyne_contents_manager},
                ),
                (
                    r"/api/tyne_copy/(?P<tyne_id>.*)",
                    TyneCopyHandler,
                    {"tyne_contents_manager": tyne_contents_manager},
                ),
                (
                    r"/api/tyne_copy_if_readonly/(?P<tyne_id>.*)",
                    TyneCopyIfReadonlyHandler,
                    {"tyne_contents_manager": tyne_contents_manager},
                ),
                (
                    r"/ws/\d+/api/tyne_delete/(?P<tyne_id>.*)",
                    TyneDeleteHandler,
                    {"tyne_contents_manager": tyne_contents_manager},
                ),
                (
                    r"/api/tyne_download/(?P<tyne_id>.*)/(?P<fmt>.*)/(?P<sheet_id>\d+)",
                    TyneDownloadHandler,
                    {"tyne_contents_manager": tyne_contents_manager},
                ),
                (
                    r"/api/tyne_download/(?P<tyne_id>.*)/(?P<fmt>.*)",
                    TyneDownloadHandler,
                    {"tyne_contents_manager": tyne_contents_manager},
                ),
                (
                    r"/api/tyne_list",
                    TyneListHandler,
                    {"tyne_contents_manager": tyne_contents_manager},
                ),
                (
                    r"/api/gallery_sync",
                    GallerySyncHandler,
                    {"tyne_contents_manager": tyne_contents_manager},
                ),
                (
                    r"/api/tyne_import",
                    TyneImportHandler,
                    {"tyne_contents_manager": tyne_contents_manager},
                ),
                (
                    r"/-",
                    NeptyneRedirectHandler,
                ),
                (
                    r"/neptyne",
                    NeptyneRedirectHandler,
                ),
                (
                    r"/neptyne/(?P<tyne_id>.*)",
                    NeptyneRedirectHandler,
                ),
                (
                    r"/-/(?P<tyne_id>.*)",
                    MetaTagProxyHandler,
                    {
                        "tyne_contents_manager": tyne_contents_manager,
                        "client_config": client_config,
                    },
                ),
                (
                    r"/embed",
                    TyneEmbedHandler,
                    {"tyne_contents_manager": tyne_contents_manager},
                ),
                (
                    r"/embed/(?P<tyne_id>.*)/(?P<cell_id>.*)\.(?P<format>.*)",
                    TyneEmbedHandler,
                    {"tyne_contents_manager": tyne_contents_manager},
                ),
                (
                    r"/embed/(?P<tyne_id>.*)\.(?P<format>.*)",
                    TyneEmbedHandler,
                    {"tyne_contents_manager": tyne_contents_manager},
                ),
                (
                    r"/api/tyne_import_google",
                    TyneImportGoogleHandler,
                    {"tyne_contents_manager": tyne_contents_manager},
                ),
                (
                    r"/api/research",
                    ResearchHandler,
                ),
                (
                    "/api/users/self",
                    UserSelfHandler,
                ),
                (
                    "/api/users/view_state",
                    ViewStateHandler,
                ),
                (
                    "/api/tynes/(.*)/secrets",
                    TyneSecretsHandler,
                    {"tyne_contents_manager": tyne_contents_manager},
                ),
                (
                    "/api/tynes/(?P<tyne_file_name>.*)/environment",
                    TyneEnvironmentHandler,
                    {"tyne_contents_manager": tyne_contents_manager},
                ),
                (
                    r"/ws/\d+/api/file_upload",
                    TyneFileUploadHandler,
                    {"tyne_contents_manager": tyne_contents_manager},
                ),
                (
                    "/api_internal/kernels",
                    KernelListHandler,
                    {"kernel_manager": kernel_manager},
                ),
                (
                    "/api_internal/tynes",
                    TyneManagerDebugHandler,
                    {"tyne_contents_manager": tyne_contents_manager},
                ),
                (
                    r"/api_internal/tynes/(?P<tyne_id>.*)/tick",
                    DisableTickHandler,
                    {
                        "tyne_contents_manager": tyne_contents_manager,
                        "kernel_manager": kernel_manager,
                    },
                ),
                (
                    "/api_internal/tynes/(?P<tyne_id>.*)",
                    TyneDebugHandler,
                    {
                        "tyne_contents_manager": tyne_contents_manager,
                    },
                ),
                (
                    "/api/browse_cache(?:/(?P<tyne_id>.*))?",
                    BrowseCacheHandler,
                    {
                        "tyne_contents_manager": tyne_contents_manager,
                    },
                ),
                (
                    "/api/api_quotas",
                    APIQuotasHandler,
                    {"api_quota_manager": api_quota_manager},
                ),
                (
                    "/api/v1/tynes/(?P<tyne_id>.*)/functions/(?P<function>.*)",
                    TyneAPIHandler,
                    {
                        "tyne_contents_manager": tyne_contents_manager,
                        "kernel_manager": kernel_manager,
                    },
                ),
                (
                    "/api/v1/tynes/(?P<tyne_id>.*)",
                    TyneAPIHandler,
                    {
                        "tyne_contents_manager": tyne_contents_manager,
                        "kernel_manager": kernel_manager,
                    },
                ),
                (
                    "/api/tyne_api_key",
                    TyneAPIKeyHandler,
                    {"tyne_contents_manager": tyne_contents_manager},
                ),
                (
                    "/api/v1/gsheet_handler",
                    GSheetEvaluationHandler,
                    {
                        "tyne_contents_manager": tyne_contents_manager,
                        "kernel_manager": kernel_manager,
                    },
                ),
                (
                    r"/api/get_gsheet_connected_tyne/(?P<sheet_id>.*)",
                    GSheetsConnectedTyneHandler,
                    {"tyne_contents_manager": tyne_contents_manager},
                ),
                (
                    r"/api/get_connected_tyne_metadata",
                    ConnectedTyneMetadataHandler,
                ),
                (
                    r"/api/drive_open",
                    DriveOpenHandler,
                ),
                (
                    r"/api/oauth_handler",
                    OauthHandler,
                ),
                (
                    r"/api/sheet_linter",
                    SheetLinterHandler,
                    {"executor": sheet_linter_executor},
                ),
                (
                    r"/api/ai_snippet",
                    AISnippetHandler,
                ),
                (
                    r"/api/release_notes",
                    ReleaseNotesHandler,
                ),
                (
                    r"/(.*\..*)",
                    StaticFileHandler,
                    {"path": BUILD_DIR},
                ),
                (r"/(.*)", IndexHandler),
            ],
            db=db,
            feature_flags=feature_flags,
            debug=debug,
            template_path=str(Path(__file__).parent / "templates"),
            streamlit_session_store=streamlit_session_store,
            single_user_mode=single_user_mode,
            shared_secret=shared_secret,
        ),
        kernel_manager,
    )


def create_single_user_models(session: Session) -> None:
    owner = TyneOwner(
        handle="user",
        user=User(
            firebase_users=[FirebaseUser(firebase_uid="<single-user-firebase-uid>")],
            email="user@example.com",
            name="Neptyne User",
        ),
    )

    feature_toggle = FeatureToggle(name="open_access", enabled=True)

    session.add(feature_toggle)
    session.add(owner)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()


class KernelMessageLogFormatter(logging.Formatter):
    def format(self, record: Any) -> str:
        s = super().format(record)
        if kernel_msg := getattr(record, "json_fields", None):
            return f"{s}\nContents:\n{pprint.pformat(kernel_msg['msg'])}"
        return s


def configure_logger(logger: logging.Logger) -> None:
    logger.addHandler(logging.StreamHandler())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--cloudsql-instance",
        help="Connect to Cloud SQL instance",
        type=str,
        default=None,
    )
    parser.add_argument(
        "--cloudsql-user",
        help="Username for connection to Cloud SQL",
        type=str,
        default=None,
    )
    parser.add_argument(
        "--inmemory-db",
        help="Use an in-memory database",
        action="store_true",
    )
    parser.add_argument(
        "--sqlite-db",
        help="Use a sqlite database",
        type=Path,
        default="~/neptyne.db",
    )
    parser.add_argument(
        "--port",
        help="Port on which to bind",
        type=int,
        default=8877,
    )
    parser.add_argument("--debug", help="Enable debug mode", action="store_true")
    parser.add_argument(
        "--log-kernel-interactions",
        help="Log all kernel interactions to GCP logging",
        action="store_true",
    )
    parser.add_argument(
        "--kernels-in-containers",
        help="Run kernels in containers on kubernetes",
        action="store_true",
    )
    parser.add_argument(
        "--disable-tick",
        help="Disable tick()ing tynes",
        action="store_true",
    )
    parser.add_argument(
        "--num-shards",
        help="Number of replicated server instances",
        type=int,
        default=1,
    )
    parser.add_argument(
        "--shard-index",
        help="Shard index of this instance",
        type=str,
        default="0",
    )
    parser.add_argument(
        "--gcs-content-path",
        help="Where to store tyne content in GCS",
        type=str,
    )
    args = parser.parse_args()

    if args.log_kernel_interactions:
        kernel_logger = logging.getLogger("kernelLogger")
        kernel_logger.setLevel(logging.DEBUG)
        kernel_logger.propagate = False
        configure_logger(kernel_logger)

    ai_logger = logging.getLogger("aiLogger")
    ai_logger.setLevel(logging.DEBUG)
    configure_logger(ai_logger)

    neptyne_config_path = os.path.expanduser("~/.neptyne.json")
    if os.path.isfile(neptyne_config_path):
        with open(neptyne_config_path) as f:
            config = json.load(f)
    else:
        config = {}
    if "shared_secret" in config:
        gsheet_auth.shared_secret = config["shared_secret"]
    else:
        gsheet_auth.shared_secret = "".join(
            random.choices(string.ascii_letters + string.digits, k=10)
        )
        config["shared_secret"] = gsheet_auth.shared_secret
        with open(neptyne_config_path, "w") as f:
            json.dump(config, f)
    print("shared secret:", gsheet_auth.shared_secret)

    if args.inmemory_db:
        assert not (args.cloudsql_instance or args.cloudsql_user)
        db.configure_preset("sqlite")
        db.create_all()
        from testing import seed_test_data

        seed_test_data.main()
    elif args.cloudsql_instance:
        assert args.cloudsql_user
        db.configure_preset(
            "cloudsql", user=args.cloudsql_user, instance=args.cloudsql_instance
        )
    else:
        db.configure_preset("sqlite", path=args.sqlite_db.expanduser())
        db.create_all()

        with db.sessionmaker() as session:
            create_single_user_models(session)

    try:
        shard_index = int(args.shard_index)
    except ValueError:
        shard_index = int(args.shard_index.split("-")[-1])

    blob_store: BlobStore | None = None
    if args.gcs_content_path:
        assert args.gcs_content_path.startswith("gs://")
        bucket, prefix = args.gcs_content_path.removeprefix("gs://").split("/", 1)
        blob_store = GCSStore(bucket, prefix)

    tyne_storer = TyneStorer(
        blob_store=blob_store,
        executor=FakeExecutor() if args.inmemory_db or args.sqlite_db else None,
    )
    tyne_contents_manager = TyneContentsManager(
        tyne_store=tyne_storer,
        kernel_name="python_local",
        num_shards=args.num_shards,
        shard_index=shard_index,
    )
    kernel_connection_dir = Path(__file__).parent / "kernel_connections"
    app, kernel_manager = create_neptyne_app(
        tyne_contents_manager,
        kernel_connection_dir,
        db,
        debug=args.debug,
        single_user_mode=True,
        shared_secret=gsheet_auth.shared_secret,
    )

    if args.debug:
        from tornado.autoreload import add_reload_hook

        add_reload_hook(tyne_storer.cleanup)

    print(
        "Neptyne is running at:",
        f"http://localhost:{args.port}?sharedSecret={gsheet_auth.shared_secret}",
    )
    app.listen(args.port)

    async def tick() -> None:
        with db.sessionmaker() as db_session:
            await tyne_contents_manager.tick(
                session=db_session, kernel_manager=kernel_manager
            )

    async def init_kernel_manager(
        kernel_manager: NeptyneKernelService, tcm: TyneContentsManager
    ) -> None:
        if blob_store and isinstance(blob_store, GCSStore):
            await blob_store.initialize_session()
        kernel_manager.start_culler()
        print("kernel manager initialized")

    ioloop.IOLoop.current().add_callback(
        init_kernel_manager, kernel_manager, tyne_contents_manager
    )

    if not args.disable_tick:
        ioloop.PeriodicCallback(tick, 60 * 1000).start()

    def shutdown_handler(signum: Any, frame: Any) -> None:
        print("saving connected kernels")
        asyncio.run(tyne_contents_manager.prepare_for_shutdown())
        print("shutting down")
        ioloop.IOLoop.current().stop()

    signal.signal(signal.SIGTERM, shutdown_handler)

    ioloop.IOLoop.current().start()


if __name__ == "__main__":
    main()

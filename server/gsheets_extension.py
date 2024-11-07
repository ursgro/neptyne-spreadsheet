import asyncio
import hashlib
import json
from typing import Any
from uuid import uuid4

import aiohttp
import jwt
import tornado
from jwt import DecodeError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from tornado import web
from tornado.escape import json_decode
from tornado_sqlalchemy import SessionMixin

from neptyne_kernel.cell_address import Address
from neptyne_kernel.mime_types import (
    GSHEET_DOWNLOAD_KEY,
    GSHEET_ERROR_KEY,
    GSHEET_IMAGE_KEY,
)
from neptyne_kernel.neptyne_protocol import (
    DownloadRequest,
    MessageTypes,
)
from neptyne_kernel.widgets.output_widgets import PLOTLY_MIME_TYPE
from server.cors import allow_cors
from server.feature_flags import FeatureFlagsMixin
from server.gsheet_auth import (
    GSheetTokenClaims,
    decode_gsheet_extension_token,
)
from server.gsheet_tynes import get_tyne_for_gsheet
from server.gsheets_access import InvalidTokenError, get_access_token
from server.image_upload import (
    update_image_in_tyne_and_sheet,
    upload_image_set_properties,
    validate_token,
)
from server.models import (
    AccessLevel,
    FunctionCallCache,
    NonUser,
    StripeSubscriptionType,
    Tyne,
    User,
    set_tyne_property,
)
from server.neptyne_kernel_service import NeptyneKernelService
from server.nks_handler import NKSRunPyHandler
from server.tyne_content import TyneContent
from server.tyne_contents_manager import NoSuchTyneError, TyneContentsManager
from server.tyne_handler import TyneHandler, track_tyne_open
from server.tyne_info import KernelSubscriber
from server.tyne_sharding import maybe_forward_request_to_owner
from server.users import has_premium_subscription


class SheetNotFound(Exception):
    pass


async def get_gsheet_developer_metadata(
    google_sheet_id: str, oauth_token: str
) -> dict[str, str]:
    sheet_uri = f"https://sheets.googleapis.com/v4/spreadsheets/{google_sheet_id}"
    async with aiohttp.ClientSession() as http_session:
        response = await http_session.get(
            sheet_uri,
            headers={"Authorization": f"Bearer {oauth_token}"},
        )
        if response.status >= 400:
            await response.read()
            if response.status < 500:
                raise SheetNotFound
            elif response.status >= 500:
                raise ValueError("Google Sheets API error")
        developer_meta_data = {
            item["metadataKey"]: item["metadataValue"]
            for item in (await response.json()).get("developerMetadata", [])
        }
    return developer_meta_data


def get_gsheet_for_tyne(session: Session, tyne_file_name: str) -> str | None:
    tyne_model = session.execute(
        select(Tyne).where(Tyne.file_name == tyne_file_name)
    ).scalar_one_or_none()
    if tyne_model is None:
        return None
    sheet_model = tyne_model.google_sheet
    if sheet_model is None:
        return None
    return sheet_model.sheet_id


class ExpressionEvaluatorHandler(SessionMixin, web.RequestHandler):
    tyne_contents_manager: TyneContentsManager
    kernel_manager: NeptyneKernelService
    user: NonUser | User

    async def evaluate(
        self,
        tyne_name: str,
        tyne_id: int,
        session_id: str,
        expression: str,
        cell_id: str | None,
        *,
        gsheet_id: str | None = None,
        user_email: str | None = None,
        source: str | None = None,
        use_cache: bool = True,
    ) -> bool:
        eval_done = asyncio.Event()
        code_to_run = (
            f"N_.execute_gsheet_request({session_id!r}, {cell_id!r}, {expression!r})"
        )
        wrote_content = False

        if await maybe_forward_request_to_owner(
            self, self.tyne_contents_manager, tyne_name
        ):
            return True

        with self.make_session() as session:
            tyne_proxy = await self.tyne_contents_manager.get(
                tyne_name, session, self.user
            )
            if not tyne_proxy:
                raise web.HTTPError(404, "Tyne does not exist")

            if use_cache:
                code_panel = tyne_proxy.tyne_info.notebook.code_panel_code().strip()
                combined_hash = hashlib.sha256(
                    (expression + code_panel).encode("utf-8")
                ).hexdigest()
                if cached := (
                    session.query(FunctionCallCache)
                    .filter_by(
                        tyne_id=tyne_id,
                        combined_hash=combined_hash,
                    )
                    .order_by(FunctionCallCache.date.desc())
                    .first()
                ):
                    if cached.mime_type not in (
                        GSHEET_IMAGE_KEY,
                        PLOTLY_MIME_TYPE,
                    ):
                        self.set_header("Content-Type", cached.mime_type)
                        await self.finish(cached.result)
                        return True

            tyne_proxy.load_user_secrets(None, session)

        load_init_data = self.tyne_contents_manager.init_data_loader(
            tyne_name, self.make_session
        )

        async def on_kernel_msg(stream: Any, msg: dict[str, Any]) -> None:
            nonlocal wrote_content
            if msg["msg_type"] == MessageTypes.USER_API_RESPONSE_STREAM.value:
                content = msg["content"]
                content_type = content["content_type"]
                if content["session_id"] == session_id:
                    try:
                        cell_id_from_header = msg["parent_header"]["cellId"]
                        addr = (
                            Address.from_a1_or_str(cell_id_from_header)
                            if cell_id_from_header
                            else None
                        )
                        encoded_content = content["content"]
                        if content["source"] == "formula":
                            if (
                                content_type == GSHEET_IMAGE_KEY
                                or content_type == PLOTLY_MIME_TYPE
                            ):
                                token_valid = await validate_token(
                                    self.tyne_contents_manager, self.user, tyne_name
                                )
                                if not token_valid:
                                    content["content"] = (
                                        '"Requires enabling Neptyne Advanced Features"'
                                    )
                                else:
                                    emoji = "🖼"
                                    if content_type == PLOTLY_MIME_TYPE:
                                        emoji = "📊"
                                    content["content"] = f'"Neptyne {emoji}"'

                                    assert addr is not None
                                    tornado.ioloop.IOLoop.current().add_callback(
                                        lambda args: upload_image_set_properties(*args),
                                        (
                                            self.tyne_contents_manager,
                                            self.user,
                                            tyne_name,
                                            addr,
                                            content_type,
                                            encoded_content,
                                        ),
                                    )
                            else:
                                if addr is not None:
                                    await update_image_in_tyne_and_sheet(
                                        self.tyne_contents_manager,
                                        self.user,
                                        tyne_name,
                                        addr,
                                    )
                                # TODO: Support caching for the json/url of images.
                                if (
                                    content["content_type"] != GSHEET_ERROR_KEY
                                    and use_cache
                                    and content["caching"] != "never"
                                ):
                                    with self.make_session() as session:
                                        new_function_call_cache = FunctionCallCache(
                                            tyne_id=tyne_id,
                                            expression=expression,
                                            code_panel=tyne_proxy.tyne_info.notebook.code_panel_code().strip(),
                                            mime_type=content["content_type"],
                                            result=content["content"],
                                            combined_hash=hashlib.sha256(
                                                (expression + code_panel).encode(
                                                    "utf-8"
                                                )
                                            ).hexdigest(),
                                        )
                                        session.add(new_function_call_cache)
                                        session.commit()

                        self.set_header("Content-Type", content["content_type"])
                        self.write(content["content"])
                        await self.flush()
                        wrote_content = True
                    finally:
                        eval_done.set()
            elif msg["msg_type"] == MessageTypes.START_DOWNLOAD.value:
                self.set_header("Content-Type", GSHEET_DOWNLOAD_KEY)
                request = DownloadRequest.from_dict(msg["content"])
                self.write(
                    json.dumps(
                        {
                            "name": request.filename,
                            "value": request.payload,
                            "mimetype": request.mimetype,
                        }
                    )
                )
                await self.flush()
                wrote_content = True
                eval_done.set()

        subscriber = KernelSubscriber(
            on_kernel_msg=on_kernel_msg,
            user_email=user_email
            if isinstance(self.user, NonUser)
            else self.user.email,
            user_name="" if isinstance(self.user, NonUser) else self.user.name,
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
        try:
            await tyne_proxy.tyne_info.execute_and_wait(
                None,
                code_to_run,
                reason="API call",
                timeout=30,
                tyne_secrets=tyne_proxy.get_tyne_secrets(),
                skip_input_transformers=True,
                user_api_token=None,
                user_email=user_email,
                session_id=session_id,
            )
        except asyncio.TimeoutError:
            eval_done.set()
            raise
        finally:
            await eval_done.wait()
            tyne_proxy.update_kernel_subscriber(session_id, None)

        return wrote_content


def maybe_update_tyne_ownership_for_gsheet(
    session: Session,
    tyne_model: Tyne,
    owner_email: str | None,
    user: NonUser | User,
) -> None:
    assert tyne_model.google_sheet

    did_update_ownership = False
    if owner_email:
        if tyne_model.google_sheet.owner_email != owner_email:
            tyne_model.google_sheet.owner_email = owner_email
            did_update_ownership = True

        owner = session.query(User).filter(User.email == owner_email).one_or_none()
        if owner and tyne_model.google_sheet.charge_user_id != owner.id:
            tyne_model.google_sheet.charge_user_id = owner.id
            did_update_ownership = True

    if not tyne_model.google_sheet.charge_user_id and isinstance(user, User):
        tyne_model.google_sheet.charge_user_id = user.id
        did_update_ownership = True

    if did_update_ownership:
        session.add(tyne_model)
        session.commit()


async def get_or_create_tyne_for_sheet(
    tyne_contents_manager: TyneContentsManager,
    sheet_id: str,
    tyne_file_name: str | None,
    session: Session,
    owner_email: str | None,
    user: NonUser | User,
    return_content: bool = False,
) -> tuple[TyneContent | None, Tyne]:
    tyne_model_id = get_tyne_for_gsheet(session, sheet_id)
    tyne_content, tyne_model = None, None
    if tyne_model_id is None:
        try:
            tyne_content, tyne_model = await new_tyne_for_sheet(
                tyne_contents_manager,
                sheet_id,
                tyne_file_name,
                session,
            )
        except IntegrityError:
            tyne_model_id = get_tyne_for_gsheet(session, sheet_id)
        if tyne_model_id is None and tyne_content is None:
            raise RuntimeError("Could not create tyne for sheet")
    if not tyne_model:
        tyne_model = session.query(Tyne).get(tyne_model_id)

    assert tyne_model is not None
    maybe_update_tyne_ownership_for_gsheet(session, tyne_model, owner_email, user)

    if tyne_content:
        return tyne_content, tyne_model

    if return_content:
        tyne_content = await tyne_contents_manager.tyne_store.load(
            tyne_model.file_name, session
        )
    return tyne_content, tyne_model


async def new_tyne_for_sheet(
    tyne_contents_manager: TyneContentsManager,
    sheet_id: str,
    original_tyne_file_name: str | None,
    session: Session,
) -> tuple[TyneContent, Tyne]:
    content = TyneContent.empty()
    tyne = None
    if original_tyne_file_name:
        try:
            tyne = await tyne_contents_manager.copy_tyne(
                session,
                original_tyne_file_name,
                new_name=None,
                user=NonUser.GSHEET,
                linked_gsheet_id=sheet_id,
            )
        except NoSuchTyneError:
            # This can happen if we switch environments (staging vs prod) or if the original sheet is deleted
            pass
    if tyne is None:
        tyne = await tyne_contents_manager.new_tyne(
            session,
            user=None,
            content=content,
            linked_gsheet_id=sheet_id,
        )

    tyne_model = tyne.tyne_model
    tyne_content = tyne.tyne_content
    return tyne_content, tyne_model


class GSheetEvaluationHandler(ExpressionEvaluatorHandler):
    tyne_contents_manager: TyneContentsManager
    kernel_manager: NeptyneKernelService
    user: NonUser = NonUser.GSHEET

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

    async def post(self) -> None:
        try:
            payload = json_decode(self.request.body)

            neptyne_token = payload["token"]
            use_cache = not payload.get("noCache")
            assert neptyne_token
            decoded_token = decode_gsheet_extension_token(neptyne_token)

            gsheet_id = decoded_token.sheet_id
            owner_email = decoded_token.owner_email

            tyne_file_name = decoded_token.tyne_file_name
            source = payload.get("source", "")
            with self.make_session() as session:
                _tyne_content, tyne_model = await get_or_create_tyne_for_sheet(
                    self.tyne_contents_manager,
                    gsheet_id,
                    tyne_file_name,
                    session,
                    owner_email,
                    self.user,
                )
                file_name = tyne_model.file_name
                self.set_header("X-Neptyne-Tyne-File-Name", file_name)
                tyne_id = tyne_model.id

                expression = payload["expression"]
                cell = payload["cell"]
                address = Address.from_a1(cell, payload["sheet"]) if cell else None

            if content := await NKSRunPyHandler.run_py(expression, tyne_id):
                self.set_header("Content-Type", "text/json")
                await self.finish(content)
                return

            session_id = uuid4().hex

            wrote_content = await self.evaluate(
                file_name,
                tyne_id,
                session_id,
                expression,
                address.to_cell_id() if address else None,
                gsheet_id=gsheet_id,
                user_email=decoded_token.user_email,
                source=source,
                use_cache=use_cache,
            )
            if not wrote_content:
                raise ValueError("No response from kernel")
        except Exception as e:
            import traceback

            if not isinstance(e, asyncio.TimeoutError):
                traceback.print_exc()
            self.set_status(200)
            self.set_header("Content-Type", GSHEET_ERROR_KEY)
            await self.finish(
                json.dumps({"ename": "Exception", "message": repr(e), "line": -1})
            )


class DriveOpenHandler(SessionMixin, web.RequestHandler):
    async def get(self) -> None:
        state = json.loads(self.get_argument("state"))
        self.set_header("Content-Type", "text/html")
        await self.finish(json.dumps(state, indent=2, sort_keys=True, default=str))


class GSheetsConnectedTyneHandler(TyneHandler):
    async def get(self, sheet_id: str) -> None:
        if gsheet_auth_token := self.request.headers.get("X-Neptyne-GSheet-Auth-Token"):
            token = decode_gsheet_extension_token(gsheet_auth_token)
            owner_email = token.owner_email
            tyne_file_name = token.tyne_file_name
        else:
            raise web.HTTPError(403, "No auth token provided")

        tyne_content, tyne_model = await get_or_create_tyne_for_sheet(
            self.tyne_contents_manager,
            sheet_id,
            tyne_file_name,
            self.session,
            owner_email,
            self.user,
            return_content=True,
        )
        assert tyne_content is not None

        if self.user.gsheets_refresh_token:
            try:
                await get_access_token(self.user.gsheets_refresh_token)
                tyne_model.gsheets_refresh_token = self.user.gsheets_refresh_token
                self.session.add(tyne_model)
                self.session.commit()
            except InvalidTokenError:
                pass

        if self.time_zone and (
            not tyne_model.properties or not tyne_model.properties.get("time_zone")
        ):
            set_tyne_property(tyne_model, "time_zone", self.time_zone)

        if isinstance(self.user, User):
            track_tyne_open(self.user, tyne_model, self.session)

        await self.return_exported(
            tyne_model,
            tyne_content,
            access=AccessLevel.EDIT,
        )

    async def post(self, sheet_id: str) -> None:
        return await self.get(sheet_id)


class ConnectedTyneMetadataHandler(SessionMixin, FeatureFlagsMixin, web.RequestHandler):
    async def get_subscription_info(
        self, charge_user: User | None, decoded_token: GSheetTokenClaims
    ) -> dict[str, Any]:
        subscription_type = ""
        organization_domain = ""
        trial_days_left = 0

        if not charge_user and decoded_token.owner_email:
            charge_user = (
                self.session.query(User)
                .filter(User.email == decoded_token.owner_email)
                .one_or_none()
            )
        if not charge_user and decoded_token.user_email:
            charge_user = (
                self.session.query(User)
                .filter(User.email == decoded_token.user_email)
                .one_or_none()
            )

        if charge_user and self.is_feature_enabled(
            charge_user, "paid-plans", email=charge_user.email
        ):
            if has_premium_subscription(self.session, charge_user):
                subscription_type = StripeSubscriptionType.INDIVIDUAL_BASE.value

        return {
            "owner_email": charge_user.email if charge_user else None,
            "subscription_type": subscription_type,
            "organization_domain": organization_domain,
            "trial_days_left": trial_days_left,
        }

    async def post(self) -> None:
        token = self.get_argument("token")
        if not token:
            raise web.HTTPError(403, "No auth token provided")
        try:
            decoded_token = decode_gsheet_extension_token(token)
        except jwt.exceptions.InvalidTokenError:
            raise web.HTTPError(400, "invalid token")
        if not decoded_token.sheet_id:
            raise web.HTTPError(400, "no sheet id in token")

        tyne_id = get_tyne_for_gsheet(self.session, decoded_token.sheet_id)
        if not tyne_id and decoded_token.owner_email:
            subscription_metadata = await self.get_subscription_info(
                None, decoded_token
            )
            return await self.finish(json.dumps(subscription_metadata))
        elif not tyne_id:
            raise web.HTTPError(404, "no tyne for sheet")
        tyne = self.session.query(Tyne).get(tyne_id)
        gsheet = tyne.google_sheet
        if not gsheet:
            raise web.HTTPError(404, "no gsheet for tyne")

        owner: User | None = gsheet.charge_user
        subscription_metadata = await self.get_subscription_info(owner, decoded_token)

        dash_metadata = (
            tyne.properties.get("dash_metadata", {}) if tyne.properties else {}
        )
        await self.finish(
            json.dumps(
                {
                    **dash_metadata,
                    **subscription_metadata,
                    "tyne_file_name": tyne.file_name,
                }
            )
        )


def can_access_gsheet_tyne(tyne: Tyne, gsheet_auth_token: str) -> bool:
    try:
        payload = decode_gsheet_extension_token(gsheet_auth_token)
        return tyne.google_sheet and tyne.google_sheet.sheet_id == payload.sheet_id
    except DecodeError:
        return False


async def get_gsheet_tyne(
    tyne_file_name: str, gsheet_auth_token: str, session: Session
) -> Tyne | None:
    res = session.execute(
        select(Tyne).where(Tyne.file_name == tyne_file_name)
    ).scalar_one_or_none()
    if res is None:
        return None
    if can_access_gsheet_tyne(res, gsheet_auth_token):
        return res

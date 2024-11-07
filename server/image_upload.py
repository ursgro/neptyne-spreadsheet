import base64
import json
import os
from typing import TYPE_CHECKING
from uuid import uuid4

import aiohttp
import plotly.io as pio
from gcloud.aio.storage import Storage
from PIL import ImageFont
from tornado import web
from tornado.escape import json_decode
from tornado.httpclient import AsyncHTTPClient, HTTPClientError

from neptyne_kernel.cell_address import Address
from neptyne_kernel.mime_types import GSHEET_IMAGE_KEY
from neptyne_kernel.mutex_manager import AsyncMutexManager
from neptyne_kernel.neptyne_protocol import (
    GSheetsImage,
)
from neptyne_kernel.widgets.output_widgets import (
    DEFAULT_OUTPUT_WIDGET_HEIGHT,
    DEFAULT_OUTPUT_WIDGET_WIDTH,
    MAX_OUTPUT_WIDGET_HEIGHT,
    MAX_OUTPUT_WIDGET_WIDTH,
    PLOTLY_MIME_TYPE,
)
from server.gsheets_access import InvalidTokenError, get_access_token
from server.models import NonUser, User, db, set_tyne_property

PUBLIC_NEPTYNE_IMAGE_BUCKET = "neptyne-gsheets-images"
GSHEET_IMAGES_TYNE_PROPERTY = "gsheets_images"

if TYPE_CHECKING:
    from server.tyne_contents_manager import TyneContentsManager


gsheets_image_mutex_manager = AsyncMutexManager()


def load_font(font_size: int) -> ImageFont:
    for font in ["Helvetica", "DejaVuSans", "arial"]:
        try:
            return ImageFont.truetype(font, font_size)
        except OSError:
            pass
    return ImageFont.load_default()


async def upload_image_to_gcs(
    image: bytes,
    tyne_id: str | None = None,
    addr: Address | None = None,
    img_format: str = "jpeg",
    bucket: str = PUBLIC_NEPTYNE_IMAGE_BUCKET,
) -> str:
    async with aiohttp.ClientSession() as http_session:
        file_id = str(uuid4())
        storage = Storage(session=http_session)  # type: ignore
        status = await storage.upload(
            bucket,
            f"{tyne_id + '/' if tyne_id else ''}{addr.to_cell_id() + '/' if addr else ''}{file_id}.{img_format}",
            image,
        )
        return f"https://storage.googleapis.com/{status['bucket']}/{status['name']}"


def decode_image(
    content_type: str, content: str
) -> tuple[bytes, str] | tuple[bytes, str, int, int]:
    """Returns tuple of image content as bytes and image format and optionally render size"""
    if content_type == GSHEET_IMAGE_KEY:
        img = json_decode(content)
        img_bytes = base64.b64decode(img["bytes"])
        return img_bytes, img["format"]
    elif content_type == PLOTLY_MIME_TYPE:
        figure = pio.from_json(json.loads(content))
        width = min(
            (figure.layout.width or DEFAULT_OUTPUT_WIDGET_WIDTH),
            MAX_OUTPUT_WIDGET_WIDTH,
        )
        height = min(
            (figure.layout.height or DEFAULT_OUTPUT_WIDGET_HEIGHT),
            MAX_OUTPUT_WIDGET_HEIGHT,
        )
        image = pio.to_image(figure, format="jpeg", width=width, height=height, scale=2)
        return image, "jpeg", width, height
    else:
        return json_decode(content)


async def validate_token(
    tyne_contents_manager: "TyneContentsManager", user: User | NonUser, tyne_name: str
) -> bool:
    refresh_token = None
    with db.sessionmaker() as db_session:
        tyne_model = await tyne_contents_manager.load_tyne_model(
            tyne_name, db_session, user
        )
        if not refresh_token:
            refresh_token = tyne_model.gsheets_refresh_token

        if not refresh_token:
            return False

    try:
        await get_access_token(refresh_token)
    except InvalidTokenError:
        return False

    return True


async def proxy_server_insert_gsheets_image(
    refresh_token: str,
    spreadsheet_id: str,
    *,
    gsheets_image: GSheetsImage,
    render_size: tuple[int, int] | None = None,
) -> None:
    api_executable_url = (
        os.getenv("GSHEETS_API_EXECUTABLE_URL")
        or "https://script.googleapis.com/v1/scripts/AKfycbza2E39tLP6t-3K0aWxDAZlLy0_RjMPOLyiN3jFUq72VeZ1nYPqxYJd65N9OIepFcVz:run"
    )

    try:
        access_token, _expires_in = await get_access_token(refresh_token)
    except InvalidTokenError:
        raise web.HTTPError(401, "Invalid refresh token")

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    params = gsheets_image.to_dict()
    if render_size:
        params["render_width"] = render_size[0]
        params["render_height"] = render_size[1]
    payload = {
        "function": "insertImageHandler",
        "parameters": [
            spreadsheet_id,
            json.dumps(params),
        ],
    }

    async_mutex = await gsheets_image_mutex_manager.get_mutex(
        f"{spreadsheet_id}{gsheets_image.address}"
    )
    async with async_mutex:
        try:
            http_client = AsyncHTTPClient()
            await http_client.fetch(
                api_executable_url,
                method="POST",
                headers=headers,
                body=json.dumps(payload),
            )
        except HTTPClientError as e:
            raise web.HTTPError(e.code, e.response.body.decode() if e.response else "")


async def update_image_in_tyne_and_sheet(
    tyne_contents_manager: "TyneContentsManager",
    user: User | NonUser,
    tyne_id: str,
    addr: Address,
    *,
    gsheets_image: GSheetsImage | None = None,
    render_size: tuple[int, int] | None = None,
) -> None:
    refresh_token = None
    with db.sessionmaker() as db_session:
        tyne_model = await tyne_contents_manager.load_tyne_model(
            tyne_id, db_session, user
        )
        if refresh_token is None:
            refresh_token = tyne_model.gsheets_refresh_token
        spreadsheet_id = tyne_model.google_sheet.sheet_id

        gsheets_images = tyne_contents_manager.get_tyne_property(
            tyne_model, GSHEET_IMAGES_TYNE_PROPERTY, {}
        )

        addr_string = addr.to_cell_id()
        if gsheets_image is not None:
            gsheets_images[addr_string] = gsheets_image.to_dict()
        elif addr_string in gsheets_images:
            del gsheets_images[addr_string]
        else:
            return

        set_tyne_property(tyne_model, GSHEET_IMAGES_TYNE_PROPERTY, gsheets_images)

        db_session.add(tyne_model)
        db_session.commit()

    if gsheets_image:
        await proxy_server_insert_gsheets_image(
            refresh_token,
            spreadsheet_id,
            gsheets_image=gsheets_image,
            render_size=render_size,
        )


async def upload_image_set_properties(
    tyne_contents_manager: "TyneContentsManager",
    user: User | NonUser,
    tyne_id: str,
    addr: Address,
    content_type: str,
    encoded_content: str,
) -> None:
    image, img_format, *render_size = decode_image(content_type, encoded_content)
    url = await upload_image_to_gcs(image, tyne_id, addr, img_format)

    gsheets_image = GSheetsImage(
        url=url,
        object_type=content_type,
        address=addr.to_cell_id(),
        sheet=addr.sheet,
        row=addr.row,
        col=addr.column,
        action=None,
        action_number=None,
    )

    await update_image_in_tyne_and_sheet(
        tyne_contents_manager,
        user,
        tyne_id,
        addr,
        gsheets_image=gsheets_image,
        render_size=(render_size[0], render_size[1])
        if render_size and len(render_size) == 2
        else None,
    )

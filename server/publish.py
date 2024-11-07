import json
import re
import urllib.parse
from pathlib import Path
from typing import (
    Any,
)

import aiohttp
from tornado import template, web
from tornado.httputil import HTTPServerRequest
from tornado_sqlalchemy import SessionMixin

from neptyne_kernel.cell_address import (
    Address,
)
from neptyne_kernel.neptyne_protocol import (
    CellAttribute,
)
from neptyne_kernel.tyne_model.cell import SheetCell
from neptyne_kernel.tyne_model.jupyter_notebook import Output
from neptyne_kernel.tyne_model.sheet import TyneSheets
from neptyne_kernel.widgets.output_widgets import (
    DEFAULT_OUTPUT_WIDGET_HEIGHT,
    DEFAULT_OUTPUT_WIDGET_WIDTH,
    PLOTLY_MIME_TYPE,
    OutputWidget,
    plotly_to_image,
)

from .aiohttp_client_session_mixin import HTTPClientSessionMixin
from .models import NonUser
from .tyne_contents_manager import NoSuchTyneError, TyneContentsManager

META_TAG_REGEX = re.compile(r'<meta (name|property)="([^"]*)" content="([^"]*)"\s*/?>')


def domain_from_request(request: HTTPServerRequest) -> str:
    if forwarded_host := request.headers.get("X-Forwarded-Host"):
        host = forwarded_host
    else:
        host = request.host
    if forwarded_protocol := request.headers.get("X-Forwarded-Proto"):
        protocol = forwarded_protocol.split(",")[0]
    else:
        protocol = request.protocol
    domain = protocol + "://" + host
    return domain


def first_cell_with_widget(sheets: TyneSheets) -> Address | None:
    for sheet in sheets.sheets.values():
        for cell_address in sorted(sheet.cells.keys()):
            cell = sheet.cells[cell_address]
            output = cell.output
            if isinstance(output, Output):
                if output.data and isinstance(output.data, dict):
                    if (
                        OutputWidget.mime_type.value in output.data
                        and output.data[OutputWidget.mime_type.value].get("widget")  # type: ignore
                        != "markdown"
                    ) or PLOTLY_MIME_TYPE in output.data:
                        return cell_address
    return None


def cells_and_sizes(
    sheets: TyneSheets, cell_id: str | None
) -> tuple[SheetCell | None, int, int]:
    if cell_id is None:
        cell_address = first_cell_with_widget(sheets)
    else:
        cell_address = Address.from_a1_or_str(cell_id)

    if cell_address:
        cell = sheets.get(cell_address)
        if cell is not None:
            cell_attributes = cell.attributes or {}

            def default_int(key: str, default_value: int) -> int:
                if key in cell_attributes:
                    try:
                        return int(cell_attributes[key])
                    except ValueError:
                        pass
                return default_value

            width = default_int(
                CellAttribute.RENDER_WIDTH.value,
                DEFAULT_OUTPUT_WIDGET_WIDTH,
            )
            height = default_int(
                CellAttribute.RENDER_HEIGHT.value,
                DEFAULT_OUTPUT_WIDGET_HEIGHT,
            )
            return cell, width, height
    return None, 0, 0


def get_embed_content(
    tyne_sheets: TyneSheets,
    cell_id: str | None,
    tyne_url: str,
    max_width: int,
    max_height: int,
) -> tuple[int, int, str]:
    CONTENT_TYPE = "text/html"
    anchor_back = (
        f'<a href="{tyne_url}" '
        f'style="position: absolute; right: 10px; bottom: 10px; background-color:#26BFAD; color:#FFFFFF'
        f'padding: 2px; text-decoration: none">'
        f"See the data</a>"
    )
    cell, width, height = cells_and_sizes(tyne_sheets, cell_id)
    if cell:
        for data in cell.iterate_outputs_data():
            if CONTENT_TYPE in data:
                if max_width:
                    width = min(width, max_width)
                if max_height:
                    height = min(height, max_height)
                widget_content = data[CONTENT_TYPE]
                if isinstance(widget_content, list):
                    widget_content = "\n".join(widget_content)
                # Plotly doesn't want to be responsive, so we need to
                # set the width and height explicitly:
                widget_content = widget_content.replace(
                    'class="plotly-graph-div" style="height:100%; width:100%;"',
                    f'class="plotly-graph-div" style="height:{height}px; width:{width}px;"',
                )
                content = anchor_back + widget_content
                return width, height, content
    return 0, 0, ""


async def render_cell(
    tyne_sheets: TyneSheets,
    cell_id: str | None,
    format: str,
    http_client: aiohttp.ClientSession | None = None,
    return_place_holder: bool = True,
) -> bytes:
    cell, width, height = cells_and_sizes(tyne_sheets, cell_id)
    if cell:
        for data in cell.iterate_outputs_data():
            if isinstance(data, dict) and PLOTLY_MIME_TYPE in data:
                fig_dict = data[PLOTLY_MIME_TYPE]
                assert isinstance(fig_dict, dict)
                return plotly_to_image(fig_dict, width, height, format)
    if return_place_holder:
        assert http_client
        resp = await http_client.get("https://app.neptyne.com/img/preview.png")
        return await resp.read()
    return b""


class MetaTagProxyHandler(SessionMixin, web.RequestHandler, HTTPClientSessionMixin):
    html_template = ""

    def initialize(
        self, tyne_contents_manager: TyneContentsManager, client_config: dict[str, Any]
    ) -> None:
        self.tyne_contents_manager = tyne_contents_manager
        self.client_config_json = json.dumps(client_config)

    async def get(
        self,
        tyne_id: str,
    ) -> None:
        domain = domain_from_request(self.request)
        if not MetaTagProxyHandler.html_template:
            http_client = await self.get_http_client()
            # Fetch the HTML template from the server. We specify a url that doesn't exist but that should
            # be handled by whatever is producing the react version of our app.
            resp = await http_client.get(
                domain + "/--/react-version-of-app", headers={"accept": "*/*"}
            )
            MetaTagProxyHandler.html_template = await resp.text("utf-8")

        html = MetaTagProxyHandler.html_template
        try:
            tyne = await self.tyne_contents_manager.load_tyne_model(
                tyne_id, self.session, NonUser.ANONYMOUS
            )
            tyne_name = tyne.name

            default_description = "click to see how this visualization was created"
            tyne_description = (
                tyne.properties.get("description", default_description)
                if tyne.properties
                else default_description
            )

            def replace_meta_tag(match: re.Match) -> str:
                provider_name = match.group(2)
                name = provider_name.split(":")[-1]

                content = match.group(3)
                if name == "title":
                    content = tyne_name
                elif name == "description":
                    content = tyne_description
                elif name == "image":
                    content = f"{domain}/embed/{tyne_id}.png"
                elif name == "url":
                    content = f"{domain}/-/{tyne_id}"
                return f'<meta property="{provider_name}" content="{content}"/>'

            html = html.replace(
                "<title>Neptyne</title>",
                f"<title>{tyne_name}</title>",
            )
            html = re.sub(
                META_TAG_REGEX,
                replace_meta_tag,
                html,
            )
        except NoSuchTyneError:
            pass  # Swallow

        html = html.replace("__APP_CONFIG__", self.client_config_json)
        self.set_header("Content-Type", "text/html")
        await self.finish(html)


class TyneEmbedHandler(SessionMixin, web.RequestHandler, HTTPClientSessionMixin):
    def initialize(self, tyne_contents_manager: TyneContentsManager) -> None:
        self.tyne_contents_manager = tyne_contents_manager

    async def get(
        self,
        tyne_id: str | None = None,
        cell_id: str | None = None,
        format: str = "json",
    ) -> None:
        with self.make_session() as session:
            max_width = int(self.get_argument("max_width", "0"))
            max_height = int(self.get_argument("max_height", "0"))

            if tyne_id is None:
                url = self.get_argument("url", None)
                if url is None:
                    raise web.HTTPError(400)
                url_bits = urllib.parse.urlparse(url)
                path_components = [x for x in url_bits.path.split("/") if x]
                if len(path_components) < 2:
                    raise web.HTTPError(400)
                tyne_id = path_components[1]
                cell_id = path_components[2] if len(path_components) > 2 else None
                format = self.get_argument("format", "json")

            try:
                tyne = await self.tyne_contents_manager.load_tyne_model(
                    tyne_id, session, NonUser.ANONYMOUS
                )
            except NoSuchTyneError:
                raise web.HTTPError(404, "Tyne not found")

            tyne_content = await self.tyne_contents_manager.tyne_store.load(
                tyne_id, self.session
            )

            if format == "png":
                self.set_header("Content-Type", "image/" + format)
                http_client = await self.get_http_client()
                img = await render_cell(
                    tyne_content.sheets, cell_id, format, http_client
                )
                await self.finish(img)
                return

            domain = domain_from_request(self.request)
            tyne_url = domain + "/-/" + tyne_id
            embed_url = domain + "/embed/" + tyne_id

            width, height, content = get_embed_content(
                tyne_content.sheets, cell_id, tyne_url, max_width, max_height
            )

            if not content:
                raise web.HTTPError(404, f"No widget found for {cell_id}")
            if format == "html":
                self.set_header("Content-Type", "text/html")
                t = template.Template(
                    open(Path(__file__).parent / "templates" / "embed.html").read()
                )

                oembed_url = embed_url
                if cell_id:
                    oembed_url += "/" + cell_id
                oembed_url += ".json"

                default_description = "Neptyne: the programmable spreadsheet"
                tyne_description = (
                    tyne.properties.get("description", default_description)
                    if tyne.properties
                    else default_description
                )

                html_content = t.generate(
                    title=tyne.name,
                    filename=tyne.file_name,
                    content=content,
                    oembed_url=oembed_url,
                    description=tyne_description,
                    width=width,
                    height=height,
                )
                await self.finish(html_content)
            elif format == "json":
                thumbnail_url = embed_url
                if cell_id:
                    thumbnail_url += "/" + cell_id
                thumbnail_url += ".png"
                self.set_header("Content-Type", "application/json")

                iframe_src = embed_url + ".html"
                if max_width or max_height:
                    iframe_src += "?" + urllib.parse.urlencode(
                        {"max_width": max_width, "max_height": max_height}
                    )

                iframe = (
                    f"<iframe src='{iframe_src}' "
                    f"width='{width}' height='{height}' "
                    f"frameborder='0' allowfullscreen></iframe>"
                )

                oembed_json = {
                    "version": "1.0",
                    "cache_age": 3600,
                    "provider_name": "Neptyne",
                    "provider_url": "https://neptyne.com/",
                    "type": "rich",
                    "title": tyne.name,
                    "width": width,
                    "height": height,
                    "url": tyne_url,
                    "web_page": tyne_url,
                    "license": "All Rights Reserved",
                    "license_id": 0,
                    "html": iframe,
                    "thumbnail_url": thumbnail_url,
                    "thumbnail_width": width,
                    "thumbnail_height": height,
                }
                await self.finish(json.dumps(oembed_json))
            else:
                raise web.HTTPError(415, "unknown format")

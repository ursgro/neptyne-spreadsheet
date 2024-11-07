import json

import plotly.express as px
import pytest
from PIL import Image

from neptyne_kernel.cell_address import Address
from neptyne_kernel.mime_handling import encode_for_gsheets
from server.conftest import mock_user
from server.image_upload import decode_image, update_image_in_tyne_and_sheet


def test_encode_and_decode_image():
    image = Image.new("RGB", (100, 100))
    content_type, encoded = encode_for_gsheets(image)
    raw_decoded = json.loads(encoded)
    assert raw_decoded["width"] == 100
    decoded, filetype, *rest = decode_image(content_type, encoded)
    assert filetype == "jpeg"
    assert isinstance(decoded, bytes)
    assert rest == []

    image2 = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    content_type, encoded = encode_for_gsheets(image2)
    raw_decoded = json.loads(encoded)
    assert raw_decoded["width"] == 100
    decoded, filetype, *rest = decode_image(content_type, encoded)
    assert filetype == "png"
    assert isinstance(decoded, bytes)
    assert rest == []

    figure = px.scatter(x=[1, 2, 3], y=[4, 5, 6])
    figure.update_layout(width=300)
    content_type, encoded = encode_for_gsheets(figure)
    decoded, filetype, *rest = decode_image(content_type, encoded)
    assert filetype == "jpeg"
    assert isinstance(decoded, bytes)
    assert rest != []


@pytest.mark.asyncio
async def test_image_upload(tyne_contents_manager, dbsession):
    user = mock_user()
    tyne = (
        await tyne_contents_manager.new_tyne(dbsession, user, linked_gsheet_id="test")
    ).tyne_model

    dbsession.add(tyne)
    dbsession.commit()

    await update_image_in_tyne_and_sheet(
        tyne_contents_manager, user, tyne.file_name, Address.from_a1("A1")
    )

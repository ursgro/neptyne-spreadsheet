import asyncio
import json
import os
import urllib.parse
from unittest import mock
from unittest.mock import patch
from uuid import uuid4

import pytest
import tornado.testing
import tornado.websocket
from tornado.httpclient import AsyncHTTPClient, HTTPClientError

import server.proxied_tyne
from neptyne_kernel.cell_address import Address
from neptyne_kernel.neptyne_protocol import CellChange, MessageTypes, RunCellsContent
from neptyne_kernel.tyne_model.cell import CODEPANEL_CELL_ID, NotebookCell
from server.conftest import MOCK_USER
from server.gsheet_auth import GSheetTokenClaims
from server.kernel_simulation_tests.kernel_simulator import reflate_cell
from server.messages import HEADER_TAG, MSG_TYPE_TAG
from server.models import Notebook, Sheet, Tyne, db
from server.tyne_content import TyneContent
from server.tyne_handler import REMOTE_TYNE_KEY
from testing.test_server import ServerTestCase, auth_fetch

FAKE_NOTEBOOK = {
    "00": {
        "cell_id": "00",
        "output": "",
        "execute_count": 0,
        "depends_on": [],
        "feeds_into": [],
        "execution_policy": 0,
        "cell_type": "code",
    }
}

FAKE_SHEET = {
    "A2": {
        "cell_id": "A2",
        "outputs": [],
        "execute_count": 0,
        "depends_on": [],
        "feeds_into": [],
        "execution_policy": 0,
        "cell_type": "code",
    }
}

WIDGET_CONTENTS = "<div>Widget</div>"

WIDGET_SHEET = {
    "A1": {
        "cell_id": "A1",
        "outputs": [
            {
                "data": {
                    "application/vnd.neptyne-output-widget.v1+json": {
                        "width": 600,
                        "height": 400,
                    },
                    "text/html": WIDGET_CONTENTS,
                },
                "output_type": "execute_result",
            }
        ],
        "execute_count": 0,
        "depends_on": [],
        "feeds_into": [],
        "execution_policy": 0,
    }
}


def run_cell_msg(code, cell_id, sheet_id, msg_id=None):
    if isinstance(cell_id, Address):
        notebook = False
        cell_id = cell_id.to_float_coord()
    else:
        notebook = True
    content = {
        "silent": False,
        "store_history": True,
        "user_expressions": {},
        "allow_stdin": True,
        "stop_on_error": True,
        **RunCellsContent(
            current_sheet=0,
            to_run=[
                CellChange(
                    attributes=None, cell_id=cell_id, content=code, mime_type=None
                )
            ],
            notebook=notebook,
            for_ai=False,
            gs_mode=False,
            ai_tables=None,
            current_sheet_name="",
            sheet_ids_by_name={},
        ).to_dict(),
    }
    metadata = {"sheetId": sheet_id, "executionPolicy": -1}
    header = {
        "date": "",
        "msg_id": msg_id or str(uuid4()),
        "username": "username",
        "session": "",
        "msg_type": MessageTypes.RUN_CELLS.value,
        "version": "5.2",
    }
    msg = {
        "header": header,
        "metadata": metadata,
        "content": content,
        "buffers": [],
        "parent_header": {},
        "channel": "shell",
    }
    return msg


@pytest.mark.usefixtures("mocked_auth")
class TestServer(ServerTestCase):
    def setup_tyne(
        self, sheet_contents: dict | None = None, published=False, tyne_owner_id=0
    ) -> None:
        if sheet_contents is None:
            sheet_contents = FAKE_SHEET
        with db.sessionmaker() as session:
            notebook = Notebook(tyne_id=0, contents=FAKE_NOTEBOOK)
            sheet = Sheet(tyne_id=0, contents=sheet_contents)
            session.add(
                Tyne(
                    id=0,
                    file_name="test",
                    tyne_owner_id=tyne_owner_id,
                    notebooks=[notebook],
                    sheets=[sheet],
                    published=published,
                )
            )
            session.commit()

    @tornado.testing.gen_test
    def test_new_tyne(self):
        client = AsyncHTTPClient()
        url = self.get_url("/api/tyne_new")
        response = yield auth_fetch(client, url, method="POST", body="")
        response_obj = json.loads(response.body)
        assert response_obj[REMOTE_TYNE_KEY]

    @tornado.testing.gen_test
    async def test_delete_tyne(self):
        client = AsyncHTTPClient()
        with db.sessionmaker() as session:
            file_name = (
                await self.tyne_contents_manager.new_tyne(session, MOCK_USER)
            ).tyne_model.file_name
        url = self.get_url(f"/ws/0/api/tyne_delete/{file_name}")
        response = await auth_fetch(client, url, method="POST", body="")
        assert response.code == 200
        assert file_name not in self.tyne_contents_manager.tynes

    @tornado.testing.gen_test
    def test_get_tyne(self):
        self.setup_tyne()
        client = AsyncHTTPClient()
        url = self.get_url("/api/tyne_get/test")
        response = yield auth_fetch(client, url)
        response_obj = json.loads(response.body)
        assert response_obj[REMOTE_TYNE_KEY]

    @tornado.testing.gen_test
    def test_get_tyne_not_authorized(self):
        self.setup_tyne(tyne_owner_id=1)

        client = AsyncHTTPClient()
        url = self.get_url("/api/tyne_get/test")
        with pytest.raises(HTTPClientError):
            yield auth_fetch(client, url)

    @tornado.testing.gen_test
    def test_embed(self):
        original_path = os.getcwd()
        os.chdir(self.tmpdir)
        try:
            self.setup_tyne(WIDGET_SHEET, published=True)

            client = AsyncHTTPClient()
            url = self.get_url("/embed/test/A1.json")
            response = yield auth_fetch(client, url)
            response_obj = json.loads(response.body)
            assert response_obj["width"] == 600

            url = self.get_url("/embed/test.html")
            response = yield auth_fetch(client, url)
            assert WIDGET_CONTENTS in response.body.decode("utf-8")

            to_embed = self.get_url("/-/test")
            url = self.get_url("/embed?format=json&url=" + urllib.parse.quote(to_embed))
            response = yield auth_fetch(client, url)
            response_obj = json.loads(response.body)
            assert response_obj["width"] == 600
        finally:
            os.chdir(original_path)


@pytest.mark.usefixtures("mocked_auth")
class TestGSheetAPI(ServerTestCase):
    FIREBASE_PROJECT_ID = "confused-giraffe-1004"

    def setUp(self):
        super().setUp()
        shard_patcher = mock.patch("server.tyne_sharding.destination_for_tyne_id")
        self.addCleanup(shard_patcher.stop)
        self.mock_destination = shard_patcher.start()

        def destination_for_tyne_id_alt(uri, tyne_contents_manager, tyne_file_name):
            return self.get_url(uri)

        self.mock_destination.side_effect = destination_for_tyne_id_alt

        def false_the_first_time(self):
            setattr(
                false_the_first_time,
                "calling_count",
                getattr(false_the_first_time, "calling_count", -1) + 1,
            )
            return false_the_first_time.calling_count > 0

        # The below doesn't seem to get cleaned up. Since we're only returning False
        # one time, that seems ok.
        self.is_owner_shard_org = self.tyne_contents_manager.is_owner_shard
        self.tyne_contents_manager.is_owner_shard = false_the_first_time

    def tearDown(self):
        self.tyne_contents_manager.is_owner_shard = self.is_owner_shard_org
        return super().tearDown()

    async def make_a_tyne(self, code_panel="", requirements=""):
        content = TyneContent.empty()
        content.notebook_cells.append(
            NotebookCell(
                CODEPANEL_CELL_ID,
                raw_code=code_panel,
                compiled_code=code_panel,
            )
        )

        with db.sessionmaker() as session:
            result = await self.tyne_contents_manager.new_tyne(
                session,
                None,
                name="test",
                content=content,
            )
            file_name = result.tyne_model.file_name
            result.tyne_model.notebooks[0].requirements = requirements
            session.commit()

        return file_name

    @patch("server.gsheets_extension.decode_gsheet_extension_token")
    @tornado.testing.gen_test(timeout=20)
    async def test_evaluate(self, mock_decode):
        client = AsyncHTTPClient()
        code = "def add(a, b):\n    return a + b"
        file_name = await self.make_a_tyne(code, "")
        mock_decode.return_value = GSheetTokenClaims(
            sheet_id="a_spreadsheet_id",
            user_email="",
            tyne_file_name=file_name,
            owner_email="",
        )
        payload = {
            "token": "token",
            "cell": "A1",
            "expression": "add(2, 1)",
            "sheet": "0",
            "timezone": "US/Eastern",
            "tyneFileName": file_name,
        }
        url = self.get_url("/api/v1/gsheet_handler")
        response = await auth_fetch(
            client, url, method="POST", body=json.dumps(payload)
        )
        assert json.loads(response.body) == 3

        payload = {
            "token": "token",
            "cell": "A1",
            "expression": "add(2, 2)",
            "sheet": "0",
            "timezone": "US/Eastern",
        }
        response = await auth_fetch(
            client, url, method="POST", body=json.dumps(payload)
        )
        assert json.loads(response.body) == 4

    @patch("server.gsheets_extension.decode_gsheet_extension_token")
    @patch("aiohttp.ClientSession")
    @tornado.testing.gen_test
    async def test_connected(self, mock_session, mock_decode):
        client = AsyncHTTPClient()
        headers = {
            "X-Neptyne-GSheet-Auth-Token": "token",
            "X-Neptyne-Project-Id": self.FIREBASE_PROJECT_ID,
            "Content-Type": "application/x-www-form-urlencoded",
        }

        file_name = await self.make_a_tyne("", "test_requirements")
        mock_decode.return_value = GSheetTokenClaims(
            sheet_id="a_spreadsheet_id",
            user_email="",
            tyne_file_name=file_name,
            owner_email="",
        )
        body = urllib.parse.urlencode(
            {
                "tyneFileName": file_name,
            }
        )

        url = self.get_url("/api/get_gsheet_connected_tyne/a_spreadsheet_id")
        response = await auth_fetch(
            client,
            url,
            method="POST",
            headers=headers,
            body=body,
        )
        assert response.code == 200
        exported_tyne = json.loads(response.body)["remoteTyne"]
        assert exported_tyne["requirements"] == "test_requirements"

        with db.sessionmaker() as session:
            tyne_model = (
                session.query(Tyne)
                .filter_by(file_name=exported_tyne["file_name"])
                .first()
            )
            tyne_model.notebooks[0].requirements = "new_test_requirements"
            session.add(tyne_model)
            session.commit()

        response = await auth_fetch(client, url, headers=headers)
        exported_tyne = json.loads(response.body)["remoteTyne"]
        assert exported_tyne["requirements"] == "new_test_requirements"


class KernelTestCase(ServerTestCase):
    async def connect_websocket(self):
        with db.sessionmaker() as session:
            tyne_model = (
                await self.tyne_contents_manager.new_tyne(session, MOCK_USER)
            ).tyne_model
            self.tyne_file_name = tyne_model.file_name

        ws_url = (
            "ws://localhost:"
            + str(self.get_http_port())
            + f"/ws/0/api/kernels/{self.tyne_file_name}/channels?session_id=&token=foo"
        )

        self.received = []
        self.grid = {}
        self.kernel_ready = False
        self.awaiting_file = False

        def message_callback(msg):
            if msg is None:
                pytest.fail("the websocket connection was closed")
            self.kernel_ready = True
            parsed = json.loads(msg)
            self.received.append(parsed)
            msg_type = parsed[HEADER_TAG][MSG_TYPE_TAG]
            print("msg:", msg_type)
            if msg_type == MessageTypes.SHEET_UPDATE.value:
                for cell in parsed["content"]["cellUpdates"]:
                    cell = reflate_cell(cell)
                    self.grid[Address(*cell["cellId"])] = cell
            if msg_type == MessageTypes.UPLOAD_FILE.value:
                self.awaiting_file = True

        ws = await tornado.websocket.websocket_connect(
            ws_url, on_message_callback=message_callback
        )

        await ws.write_message(
            json.dumps(
                {
                    "header": {
                        "msg_type": MessageTypes.AUTH_REPLY.value,
                    },
                    "content": {"token": "auth-token", "projectId": None},
                }
            )
        )
        return ws

    async def wait_for(self, callable, msg=None):
        timeout_seconds = 30  # most tests will time out before this
        wait_seconds = 0.025
        for _ in range(round(timeout_seconds / wait_seconds)):
            await asyncio.sleep(wait_seconds)
            if callable():
                return
        else:
            pytest.fail(msg or "A1 did not update in time")

    async def wait_for_cell(self, address):
        def cell_in_grid():
            return address in self.grid

        await self.wait_for(cell_in_grid, f"Cell {address} did not update in time")

    async def wait_for_kernel(self):
        def kernel_ready():
            return self.kernel_ready

        await self.wait_for(kernel_ready, "Kernel did not start in time")

    async def wait_for_file_upload(self):
        def ready_for_file():
            return self.awaiting_file

        await self.wait_for(ready_for_file, "Kernel did not start in time")


def file_upload_body(tyne_file_name, file_name, file_body, boundary):
    return f"""--{boundary}
Content-Disposition: form-data; name="tyne_file_name"

{tyne_file_name}
--{boundary}
Content-Disposition: form-data; name="contents"; filename="{file_name}"
Content-Type: text/plain

{file_body}
--{boundary}--""".replace("\n", "\r\n")


@pytest.mark.usefixtures("mocked_auth")
class TestKernel(KernelTestCase):
    @tornado.testing.gen_test(timeout=10)
    async def test_start_kernel(self):
        ws_client = await self.connect_websocket()

        msg = run_cell_msg(
            "=10 + 10",
            Address(0, 0, 0),
            self.tyne_file_name,
        )

        await ws_client.write_message(json.dumps(msg))

        await self.wait_for_cell(Address(0, 0, 0))

        assert (
            self.grid[Address(0, 0, 0)]["outputs"][0]["data"]["application/json"] == 20
        )

    @tornado.testing.gen_test(timeout=10)
    async def test_save_load(self):
        ws_client = await self.connect_websocket()

        idle_save_value = server.proxied_tyne.IDLE_SAVE_WAIT
        try:
            server.proxied_tyne.IDLE_SAVE_WAIT = 0
            msg = run_cell_msg(
                "='Hello, world!'",
                Address(0, 0, 0),
                self.tyne_file_name,
            )
            await ws_client.write_message(json.dumps(msg))

            await self.wait_for_cell(Address(0, 0, 0))
            assert (
                self.grid[Address(0, 0, 0)]["outputs"][0]["data"]["application/json"]
                == "Hello, world!"
            )
        finally:
            server.proxied_tyne.IDLE_SAVE_WAIT = idle_save_value

        # Give the event loop a chance to run the save task
        max_time = 5
        sleep_time = 0.05
        session = db.sessionmaker()
        for _ in range(int(max_time / sleep_time)):
            await asyncio.sleep(sleep_time)
            sheets = session.query(Tyne).all()[0].sheets
            if sheets:
                if Address(0, 0, 0).to_cell_id() in sheets[0].contents:
                    break
        else:
            pytest.fail("tyne never saved")

        ws_client.close()
        file_name = self.tyne_file_name
        await self.tyne_contents_manager.disconnect_tynes()
        self.tyne_contents_manager.tynes.clear()
        await self.tyne_contents_manager.load_tyne_model(
            file_name, db.sessionmaker(), MOCK_USER
        )
        content = await self.tyne_contents_manager.tyne_store.load(
            self.tyne_file_name, db.sessionmaker()
        )
        assert (
            content.sheets.get(Address(0, 0, 0)).output.data["application/json"]
            == "Hello, world!"
        )

    @pytest.mark.skip(reason="This test is flaky")
    @tornado.testing.gen_test
    def test_upload_file(self):
        ws_client = yield self.connect_websocket()

        yield ws_client.write_message(
            json.dumps(
                run_cell_msg(
                    "from neptyne_kernel.sheet_api import get_file",
                    "00",
                    self.tyne_file_name,
                )
            )
        )

        yield ws_client.write_message(
            json.dumps(
                run_cell_msg(
                    "=get_file()[0].decode()",
                    Address(0, 0, 0),
                    self.tyne_file_name,
                )
            )
        )

        client = AsyncHTTPClient()
        boundary = uuid4().hex
        yield self.wait_for_file_upload()
        res = yield auth_fetch(
            client,
            self.get_url("/ws/0/api/file_upload"),
            method="POST",
            headers={
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
            body=file_upload_body(
                self.tyne_file_name,
                "my_file",
                "file_contents",
                boundary,
            ),
        )
        assert res.code == 200

        yield self.wait_for_cell(Address(0, 0, 0))

        cell = self.grid[Address(0, 0, 0)]
        assert cell["outputs"][0]["data"]["application/json"] == "file_contents"

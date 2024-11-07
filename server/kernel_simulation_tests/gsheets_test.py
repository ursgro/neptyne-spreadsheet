import json
from unittest import mock
from uuid import uuid4

import pytest
from googleapiclient.discovery import build

from neptyne_kernel.cell_address import Address
from neptyne_kernel.cell_range import CellRange
from neptyne_kernel.mime_types import GSHEET_ERROR_KEY
from neptyne_kernel.neptyne_protocol import MessageTypes
from server.messages import HEADER_TAG, MSG_TYPE_TAG


def run_gsheet(simulator, function: str) -> dict[str, str]:
    simulator.get_dash().execute_gsheet_request(uuid4().hex, "A1", function)
    for i in range(100):
        reply = simulator.kc.iopub_channel.get_msg(timeout=1)
        if (
            reply[HEADER_TAG][MSG_TYPE_TAG]
            == MessageTypes.USER_API_RESPONSE_STREAM.value
        ):
            return reply["content"]


def gsheet_command(simulator, function: str) -> str:
    return json.loads(run_gsheet(simulator, function)["content"])


def test_basic_operation(simulator):
    simulator.repl_command("def add(a, b): return a + b")

    assert gsheet_command(simulator, "add(1, 2)") == 3


def test_ranges(simulator):
    assert gsheet_command(simulator, "range(1, 10)") == [*range(1, 10)]
    assert gsheet_command(simulator, "[range(1, 10) for i in range(5)]") == [
        [*range(1, 10)] for i in range(5)
    ]


def test_error(simulator):
    simulator.repl_command("def error(a): return a / 0")
    res = run_gsheet(simulator, "error(1)")
    assert res["content_type"] == GSHEET_ERROR_KEY
    content = json.loads(res["content"])
    assert content["ename"] == "#DIV/0!"
    assert content["line"] == 2

    res = run_gsheet(simulator, "doesnotexist(1)")
    assert res["content_type"] == GSHEET_ERROR_KEY
    content = json.loads(res["content"])
    assert content["line"] is None


@pytest.fixture
def repl_dash(simulator):
    spreadsheet_id = "14_5diY4r4vPf3VUMk3w-SJna0Yl-l8_IBc9MPJ9n6Vk"
    credentials_info = {
        "type": "service_account",
        "project_id": "neptyne-gsheets-test",
        "private_key_id": "d689960134174d785e682b0222edc6635f1f4c9e",
        "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCUmBdrzxIhoqfA\nme6V95U+xFGrSzcKTcAtKHcuymnlCEjYkm0M01R1090/eGU/v98ek/wCGaAujj4o\nPGc4cTiRCoCYmbVkSp474LTGmjzHWbwBDEj50ckSFUDXgt2lCHBy1e3yelOu9waT\niUhd9g5/70IArE5VtM/qTIrrsZVz9P4lmUv1XvvPgSO6w1DE/VONGX0dkwXi1I6G\nqcfpt7lfAyynXaQc3DF1Dfdp5lKUufiUOpk+A79Q3BMDluQMqlOdeoByxL13yRwb\nSvsCU9BXehsfmrgPPchMtr8vRcKXcpeuRgdLhNW2HRh2PkxeubmGxznVC3u7f20N\nckysdAxlAgMBAAECggEADI4rUHMvK4NkXDxFcgt441RQOEKDNI4sQkSMiXoV54HD\nMfVxXGeQ1+HebGn+WBwcvKcxYHYM2FIxg1HTQOwkJPE3u20lbAN4CkQq0isfHpMA\n9S+2DNHChRIhp/QJSVQEuFdGIzpdzsdVmWq8oB/Vys6LC6aDee9sr/XmuRKIt8Ln\nH0B24e+sy4o/L7ALB2aL0CAJ9KTBopwG27JUNOOvaaNCpHHISEGTh55QDhHy4W16\n4oxXBExJk9ZW4rmKUMD+odBJQvPETdtyMB9f4mhHbn/IbLJHyOttKWWbzZhb6EUg\n0awRCTWuLCdBhv2wSmIDtwnH3lhGQ57sJ0SfK98LsQKBgQDPPsZK3qIkCuK47LqT\n17HSToZnjFdPkkYCmo5lghHUrIauvMltaZscJpA1YCjSbhiy0M9WJvqhhiWnHpMW\ncNh9NjzP9BXETaZqrKGo5BSewjJQdUv/J3M2YA09Al44j3CNV+Kd6OfaRN0uMLjp\n9T2Q6dkJVh6+X5mdjYVXr1tdWQKBgQC3jRZbAuENtXQPUXTEoHrbndyn7IFMheA8\npnPTzC5CNMFQ1RXbHcZ3pweKCRfEdjjHF1bw3PTTuahPmUUf6HSBAHOo5u5vgh+M\nHwzO1ZalSNoXPyLlmdBv/+eQOFDaAO7fswQTRML3Pjzm3Lrt3L763aE+VgEfR4w6\nDTc0n/qJ7QKBgAvj3hyNiV/n//n8GvhAd8NJHgzy0E+QZNPhaioIvF0nSNLdofDV\nDkEfNUbarXzlNCWONVcMBXUe7SoZZvbyonkMk5CawGTyz4lvPhcifsxc9+YF1MZe\nzQ1hlWDase0szZhOYoIMysCLEuWDhhhmKZIW2IzglAL4GSgg5nWRafyBAoGAK88W\n2N4VDQqUCtvsPMn4yNYixkmiirshTBiGaLTBDbg9s6dIMiYnKoPJPt7wt0loP8yI\nSbDTFn2neGgioXz/4ZJUCKolmqO6F92JVwyPih+bPhUppRdTMognorpuQbobSXUW\nseqlhhFqw8dHLmKTipi/VXt9hRO0ml5xILRWPfkCgYEAleZTYLXamm7ZiGftD/ej\nIBMDtUQgwfyBtOaL1j2fQN3pxmUgTzAuh1EtqpVoJxEawe/uNlH7FfAX+W1RaEfy\n96KimKnMef1l9Yvdlpx4KM/kl3UGA0Gm3Rz4fTo2gEiQXVV0Z26iH6/er90lSoVy\nwkd1Ru2FbfjxpN+Mkm0OQJQ=\n-----END PRIVATE KEY-----\n",
        "client_email": "service-account@neptyne-gsheets-test.iam.gserviceaccount.com",
        "client_id": "104107256020484305783",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/service-account%40neptyne-gsheets-test.iam.gserviceaccount.com",
        "universe_domain": "googleapis.com",
    }

    from google.oauth2 import service_account
    from googleapiclient.errors import HttpError

    scopes = ["https://www.googleapis.com/auth/spreadsheets"]

    dash = simulator.get_dash()
    try:
        credentials = service_account.Credentials.from_service_account_info(
            credentials_info, scopes=scopes
        )
        dash.in_gs_mode = True
        dash.gsheets_spreadsheet_id = spreadsheet_id
        dash._gsheet_service = build("sheets", "v4", credentials=credentials)
        yield dash.gsheet_service

    except HttpError as error:
        print(f"An error occurred: {error}")
    finally:
        dash.in_gs_mode = False
        dash.gsheets_spreadsheet_id = None
        dash._gsheet_service = None


@pytest.mark.parametrize(
    "cell_id, value",
    [
        ("A2", "4"),
        ("A6 + A7", "100.5"),
        ("Sheet1!A6 - Sheet1!A7", "99.5"),
        (
            "A4:D9",
            CellRange(
                [
                    ["Orange text", None, 2, None],
                    [-1, None, 3, None],
                    [100, None, 4, None],
                    [0.5, None, 5, None],
                    ["😋", None, None, None],
                    [None, None, None, None],
                ]
            ),
        ),
        ("A:A", CellRange(["A1", 4, None, "Orange text", -1, 100, 0.5, "😋"])),
        ("5:6", CellRange([[-1, None, 3], [100, None, 4]])),
        ("H11:H13", CellRange([None, None, None])),
    ],
)
def test_repl_getitem(simulator, repl_dash, cell_id, value):
    # Set the kernel returned from get_ipython to None; this makes our code not
    # try to process messages while calling out to the gsheets API, which makes
    # the test fail at least on OSX.
    with mock.patch("neptyne_kernel.gsheets_api.get_ipython") as get_ipython:
        get_ipython.return_value.kernel = None
        simulator.repl_command(cell_id)
    result = (
        simulator.tyne_info.notebook.get_cell_by_id(f"0{simulator.next_repl - 1}")
        .outputs[0]
        .data["text/plain"]
    )

    if isinstance(value, CellRange):
        value = str(value)

    assert result == value


@pytest.mark.parametrize(
    "target_cell_id, expression, result",
    [
        ("E3", "A6 + A7", 100.5),
        ("E4", "Sheet1!A6 - Sheet1!A7", 99.5),
    ],
)
def test_repl_setitem(repl_dash, simulator, target_cell_id, expression, result):
    try:
        simulator.repl_command(f"{target_cell_id}={expression}")
        assert simulator.get_dash()[Address.from_a1(target_cell_id)] == result
    finally:
        simulator.repl_command(f"{target_cell_id}=''")

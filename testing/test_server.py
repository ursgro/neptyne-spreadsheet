import shutil
import tempfile
from typing import Any, Union

import tornado.testing
from jupyter_client.utils import run_sync
from tornado.httpclient import AsyncHTTPClient, HTTPRequest

from server import application
from server.fake_executor import FakeExecutor
from server.models import db
from server.tyne_contents_manager import TyneContentsManager
from server.tyne_storer import TyneStorer


class ServerTestCase(tornado.testing.AsyncHTTPTestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        db.configure_preset("sqlite")
        db.create_all()
        self.tyne_contents_manager = TyneContentsManager(TyneStorer(FakeExecutor()))
        return super().setUp()

    def tearDown(self):
        shutil.rmtree(self.tmpdir)
        db.drop_all()
        run_sync(self.tyne_contents_manager.disconnect_tynes)()
        return super().tearDown()

    def get_app(self):
        app, _kernel_manager = application.create_neptyne_app(
            self.tyne_contents_manager,
            self.tmpdir,
            db,
            debug=True,
        )
        return app


def auth_fetch(
    client: AsyncHTTPClient,
    request: Union[str, "HTTPRequest"],
    raise_error: bool = True,
    **kwargs: Any,
):
    headers = kwargs.get("headers", {})
    headers["Authorization"] = "Bearer 0"
    kwargs["headers"] = headers
    return client.fetch(request, raise_error, **kwargs)

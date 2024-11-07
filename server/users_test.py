import pytest
import tornado.testing
from tornado.httpclient import AsyncHTTPClient, HTTPClientError
from tornado.httputil import url_concat

from testing.test_server import ServerTestCase


class TestAuth(ServerTestCase):
    @tornado.testing.gen_test
    def test_bad_auth(self):
        client = AsyncHTTPClient()
        url = self.get_url("/api/users/self")
        with pytest.raises(HTTPClientError):
            yield client.fetch(url)

        with pytest.raises(HTTPClientError):
            yield client.fetch(url, headers={"Authorization": "Bearer nonsense"})

        url = url_concat(self.get_url("/api/users/self"), {"token": "nothing"})
        with pytest.raises(HTTPClientError):
            yield client.fetch(url)

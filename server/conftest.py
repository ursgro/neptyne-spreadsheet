from unittest import mock

import pytest
from jupyter_client.utils import run_sync
from sqlalchemy.orm import Session

from server.fake_executor import FakeExecutor

from .models import FirebaseUser, User, db
from .tyne_contents_manager import TyneContentsManager
from .tyne_storer import TyneStorer


@pytest.fixture(scope="module")
def engine():
    db.configure_preset("sqlite")
    return db.engine


@pytest.fixture(scope="module")
def tables(engine):
    db.Model.metadata.create_all(engine)
    yield
    db.Model.metadata.drop_all(engine)


@pytest.fixture
def dbsession(engine, tables):
    connection = engine.connect()
    # begin the nested transaction
    transaction = connection.begin()
    # use the connection with the already started transaction
    session = Session(bind=connection)

    yield session

    session.close()
    # roll back the broader transaction
    transaction.rollback()
    # put back the connection to the connection pool
    connection.close()


@pytest.fixture
def tyne_store(dbsession):
    return TyneStorer(FakeExecutor())


@pytest.fixture
def tyne_contents_manager(tyne_store):
    tcm = TyneContentsManager(tyne_store)
    yield tcm
    run_sync(tcm.disconnect_tynes)()


MOCK_USER = User(
    id=0,
    tyne_owner_id=0,
    firebase_users=[FirebaseUser(firebase_uid="0")],
    organization=None,
)


@pytest.fixture()
def mocked_auth():
    with mock.patch("server.users._authenticate_request", return_value=MOCK_USER):
        yield MOCK_USER


def mock_user():
    return mock.Mock(tyne_owner_id="neptyne", id=0, organization=None)

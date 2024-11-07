import pytest
from IPython.core.history import HistoryManager
from IPython.core.interactiveshell import InteractiveShell

from neptyne_kernel import spreadsheet_error

from .kernel_simulator import Simulator


@pytest.fixture
def stack_trace_limit():
    original = spreadsheet_error.SHOW_FULL_TRACEBACK
    spreadsheet_error.SHOW_FULL_TRACEBACK = False
    yield
    spreadsheet_error.SHOW_FULL_TRACEBACK = original


@pytest.fixture
def disable_local_history():
    original = HistoryManager.enabled
    HistoryManager.enabled = False
    yield
    HistoryManager.enabled = original


@pytest.fixture
def simulator(dbsession, tyne_store, stack_trace_limit, disable_local_history):
    # If we run from the commandline, ipython thinks we already have an instance:
    instance = InteractiveShell._instance
    InteractiveShell.instance().display_pub
    InteractiveShell._instance = None
    simulator = Simulator(dbsession, tyne_store)
    yield simulator
    simulator.stop()
    InteractiveShell._instance = instance

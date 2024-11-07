from concurrent.futures import Executor, Future
from typing import Any, Callable


class FakeExecutor(Executor):
    # We generally need to use a fake process pool executor because of sqlite
    def submit(self, __fn: Callable, *args: Any, **kwargs: Any) -> Future:
        fut: Future = Future()
        fut.set_result(__fn(*args, **kwargs))
        return fut

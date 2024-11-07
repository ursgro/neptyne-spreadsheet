from opentelemetry.context import Context
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

from server.messages import HEADER_TAG, PARENT_HEADER_TAG, Msg


def inject_trace_context(message: Msg) -> None:
    message_header = message[HEADER_TAG]
    headers: dict
    headers = message_header["span_context"] = {}
    TraceContextTextMapPropagator().inject(headers)


def extract_trace_context(message: Msg) -> Context | None:
    message_header = message[PARENT_HEADER_TAG]
    if span_context := message_header.get("span_context"):
        return TraceContextTextMapPropagator().extract(span_context)
    return None

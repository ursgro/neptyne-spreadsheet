API_EXCEEDED_MESSAGE_PREFIX = "Neptyne API limit exceeded for service=["
PLACEHOLDER_API_KEY = "NEPTYNE_PLACEHOLDER"


TOKEN_HEADER_NAME = "X-Neptyne-Token"

NEEDS_GSHEET_ADVANCED_FEATURES_HTTP_CODE = 499


def get_api_error_service(error: str) -> str | None:
    if (ix := error.find(API_EXCEEDED_MESSAGE_PREFIX)) != -1:
        service = error[ix + len(API_EXCEEDED_MESSAGE_PREFIX) :]
        return service[: service.find("]")]


def make_api_error_message(service: str) -> str:
    return f"{API_EXCEEDED_MESSAGE_PREFIX}{service}]"

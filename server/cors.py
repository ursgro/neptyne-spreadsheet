from tornado import web


def allow_cors(handler: web.RequestHandler) -> None:
    # We should check here the origin, but somehow this doesn't get set:
    handler.set_header("Access-Control-Allow-Origin", "*")
    handler.set_header(
        "Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS"
    )
    handler.set_header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, x-neptyne-gsheet-auth-token, "
        + "x-neptyne-gsmode, x-neptyne-project-id, ngrok-skip-browser-warning",
    )

from typing import Any, Literal

from jwt import PyJWTError
from sqlalchemy import func
from sqlalchemy.orm import Session
from tornado import web
from tornado_sqlalchemy import SessionMixin

from server.gsheet_auth import decode_gsheet_extension_token
from server.models import (
    EmailShare,
    FirebaseUser,
    NonUser,
    Share,
    User,
)

WELCOME_TYNE_NAME = "welcome"


def token_from_headers(request_handler: web.RequestHandler) -> str | None:
    header = request_handler.request.headers.get("Authorization")
    if not header:
        return request_handler.request.headers.get("X-Neptyne-GSheet-Auth-Token")

    parts = header.split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise web.HTTPError(401, 'Invalid "Authorization" header')

    return parts[1]


def token_from_params(request_handler: web.RequestHandler) -> str | None:
    # Used by the websocket handler because we can't set headers in a websocket connection request
    return request_handler.get_argument("token", default=None)


async def authenticate_request(
    request_handler: web.RequestHandler,
    session: Session,
    *,
    token: str | None = None,
) -> User | Literal[NonUser.MAINTENANCE]:
    return await _authenticate_request(request_handler, session, token=token)


async def _authenticate_request(
    request_handler: web.RequestHandler,
    session: Session,
    *,
    token: str | None = None,
) -> User | Literal[NonUser.MAINTENANCE]:
    shared_secret = request_handler.application.settings.get("shared_secret")
    if not token:
        token = token_from_headers(request_handler) or token_from_params(
            request_handler
        )
    if not token:
        raise web.HTTPError(401, "Missing token")
    if not token == shared_secret:
        try:
            decode_gsheet_extension_token(token)
        except PyJWTError:
            raise web.HTTPError(401, "Invalid token")
    return await load_user(
        session,
        "<single-user-firebase-uid>",
    )


def upgrade_email_shares(session: Session, user: User) -> None:
    if not user.email:
        return
    shares = (
        session.query(EmailShare)
        .filter(func.lower(EmailShare.email) == user.email.lower())
        .all()
    )
    for share in shares:
        new_share = Share(
            user_id=user.id, tyne_id=share.tyne_id, access_level=share.access_level
        )
        session.add(new_share)
        session.delete(share)


async def load_user(
    session: Session,
    uid: str,
) -> User | Literal[NonUser.MAINTENANCE]:
    """Load the User model from the database, saving a new User if one does not exist."""
    users = (
        session.query(User)
        .join(FirebaseUser)
        .filter(FirebaseUser.firebase_uid == uid)
        .all()
    )
    if not users:
        raise web.HTTPError(401, "User not found")
    else:
        user = users[0]
    return user


def capabilities(has_neptyne_premium: bool) -> dict[str, Any]:
    return {
        "minTickFrequencySeconds": 15 * 60 if has_neptyne_premium else 24 * 60 * 60,
        "hasPremium": has_neptyne_premium,
    }


def get_capabilities(user: User | NonUser, session: Session) -> dict[str, Any]:
    if not isinstance(user, User):
        return capabilities(False)

    return capabilities(True)


def has_premium_subscription(
    session: Session,
    user: User,
) -> bool:
    return get_capabilities(user, session)["hasPremium"]


class UserRequestHandler(SessionMixin, web.RequestHandler):
    user: User

    async def prepare(self) -> None:
        self.user = await authenticate_request(self, self.session)

    def get_db_user(self) -> User:
        return self.session.query(User).filter_by(id=self.user.id).first()

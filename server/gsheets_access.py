import os

import aiohttp


class InvalidTokenError(Exception):
    pass


async def get_access_token(refresh_token: str) -> tuple[str, int]:
    client_id = os.getenv("GSHEETS_OAUTH_CLIENT_ID")
    client_secret = os.getenv("GSHEETS_OAUTH_CLIENT_SECRET")
    token_request_body = {
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }

    token_url = "https://oauth2.googleapis.com/token"

    async with aiohttp.ClientSession() as session:
        async with session.post(token_url, data=token_request_body) as response:
            if 400 <= response.status < 500:
                raise InvalidTokenError
            response.raise_for_status()
            response_body = await response.json()
            return response_body["access_token"], response_body["expires_in"]

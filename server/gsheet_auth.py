from dataclasses import dataclass

import jwt

shared_secret: str | None = None


@dataclass
class GSheetTokenClaims:
    sheet_id: str
    user_email: str
    owner_email: str | None
    tyne_file_name: str | None


def decode_gsheet_extension_token(gsheet_extension_token: str) -> GSheetTokenClaims:
    decoded_token = jwt.decode(
        gsheet_extension_token, key=shared_secret, algorithms=["HS256"]
    )
    return GSheetTokenClaims(
        sheet_id=decoded_token["sheetId"],
        user_email=decoded_token.get("userEmail"),
        owner_email=decoded_token.get("ownerEmail"),
        tyne_file_name=decoded_token.get("tyneFileName"),
    )

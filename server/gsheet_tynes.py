from sqlalchemy import select
from sqlalchemy.orm import Session

from server.models import GoogleSheet


def get_tyne_for_gsheet(session: Session, google_sheet_id: str) -> int | None:
    linked_tyne_id_row = session.execute(
        select(GoogleSheet.tyne_id).where(GoogleSheet.sheet_id == google_sheet_id)
    ).one_or_none()
    if linked_tyne_id_row is None:
        return None
    return linked_tyne_id_row[0]

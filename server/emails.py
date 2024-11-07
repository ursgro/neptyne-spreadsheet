import re

valid_email_regex = r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"


def is_valid_email(email: str) -> bool:
    return bool(re.fullmatch(valid_email_regex, email))

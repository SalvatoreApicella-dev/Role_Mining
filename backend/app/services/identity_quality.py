import re
from typing import Any

IDENTITY_NORMALIZE_RE = re.compile(r"[^a-z0-9]+")
IDENTITY_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
IDENTITY_EMPID_RE = re.compile(r"^[A-Za-z0-9_-]{4,}$")


def norm_identity_text(s: Any) -> str:
    return IDENTITY_NORMALIZE_RE.sub("", str(s or "").lower())


def is_valid_email_address(s: str) -> bool:
    return bool(IDENTITY_EMAIL_RE.match(str(s or "").strip()))


def is_valid_upn_value(s: str) -> bool:
    v = str(s or "").strip().lower()
    return bool(v and "@" in v and is_valid_email_address(v))


def is_valid_employee_id(s: str) -> bool:
    return bool(IDENTITY_EMPID_RE.match(str(s or "").strip()))


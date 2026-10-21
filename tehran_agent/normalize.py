"""Text and value normalization helpers (Persian-aware)."""
from __future__ import annotations

import re

# Map Arabic/variant Persian letters to canonical Persian forms.
_CHAR_MAP = str.maketrans({
    "ي": "ی", "ك": "ک", "ۀ": "ه", "ة": "ه",
    "\u200c": " ", "\u200f": " ", "\u200e": " ", "\u0640": "",  # ZWNJ, RLM, LRM, tatweel
})
_DIGIT_MAP = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
_NULL_TOKENS = {"", "null", "none", "nan", "n/a"}


def clean_null(value: str | None) -> str | None:
    """Return a stripped value, or None for empty / placeholder tokens."""
    if value is None:
        return None
    v = value.strip()
    return None if v.lower() in _NULL_TOKENS else v


def normalize_text(value: str | None) -> str:
    """Lowercase, unify Persian characters and digits, collapse whitespace."""
    if not value:
        return ""
    v = value.translate(_CHAR_MAP).translate(_DIGIT_MAP).lower()
    v = re.sub(r"[\u064B-\u065F]", "", v)  # strip Arabic diacritics
    v = re.sub(r"[^\w\s./-]", " ", v)      # drop punctuation but keep model-like tokens
    return re.sub(r"\s+", " ", v).strip()


def parse_budget_toman(text: str) -> int | None:
    """Parse a budget like '۱ میلیون', '1.5 میلیون', '500 هزار', '2000000' into toman."""
    t = normalize_text(text)
    m = re.search(r"(\d+(?:\.\d+)?)\s*(میلیارد|میلیون|هزار)?", t)
    if not m:
        return None
    n = float(m.group(1))
    mult = {"میلیارد": 1_000_000_000, "میلیون": 1_000_000, "هزار": 1_000}.get(m.group(2) or "", 1)
    return int(n * mult)

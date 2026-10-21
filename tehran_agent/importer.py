"""Import the Torob CSV dataset into a normalized SQLite database.

Stdlib only (csv + sqlite3). Raw CSVs are never modified.

Usage:
    python -m tehran_agent.importer --src data/raw/torob-dataset --db data/torob.sqlite
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import os
import sqlite3
import sys

from .normalize import normalize_text, clean_null

csv.field_size_limit(10**9)

# Price plausibility bounds (toman). Values outside are kept but flagged.
PRICE_MIN_OK = 1_000
PRICE_MAX_OK = 10_000_000_000  # 10 billion toman

SCHEMA = """
DROP TABLE IF EXISTS offers;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS shops;
DROP TABLE IF EXISTS meta;

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE products (
    product_id   TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    title_norm   TEXT NOT NULL,
    brand        TEXT,           -- NULL when source brand_name is missing/'null'
    category     TEXT,
    model        TEXT,           -- NULL when source model is missing/'null' (98% missing)
    image_urls   TEXT,           -- JSON array as in source
    specs        TEXT,           -- JSON array as in source
    spec_count   INTEGER NOT NULL
);

CREATE TABLE shops (
    shop_id              TEXT PRIMARY KEY,
    name                 TEXT NOT NULL,   -- may be synthetic; see docs/DATA_AUDIT.md
    address              TEXT,
    location_label       TEXT,
    lat                  REAL,            -- NULL when invalid
    lon                  REAL,
    category_names       TEXT,            -- JSON array; NOT proof of selling a product
    contacts             TEXT,            -- raw JSON; NOT verified
    website_url          TEXT,
    instagram            TEXT,
    supports_fast_delivery INTEGER,       -- NULL = unknown (75% missing)
    weekly_hours         TEXT,
    payment_options      TEXT
);

CREATE TABLE offers (
    offer_id          TEXT PRIMARY KEY,
    product_id        TEXT NOT NULL REFERENCES products(product_id),
    shop_id           TEXT NOT NULL REFERENCES shops(shop_id),
    price_toman       REAL,              -- NULL when missing
    price_status      TEXT NOT NULL,     -- ok | missing | too_low | too_high
    price_changed_at  TEXT,              -- ISO-8601 UTC; NULL = unknown
    seller_title      TEXT,
    description       TEXT,
    warranty          TEXT
);

CREATE INDEX idx_offers_product ON offers(product_id);
CREATE INDEX idx_offers_shop ON offers(shop_id);
CREATE INDEX idx_offers_price ON offers(price_toman);
CREATE INDEX idx_products_norm ON products(title_norm);
CREATE INDEX idx_shops_geo ON shops(lat, lon);
"""


def _rows(path: str):
    with open(path, encoding="utf-8", newline="") as f:
        yield from csv.DictReader(f)


def classify_price(raw: str | None) -> tuple[float | None, str]:
    value = clean_null(raw)
    if value is None:
        return None, "missing"
    try:
        p = float(value)
    except ValueError:
        return None, "missing"
    if p < PRICE_MIN_OK:
        return p, "too_low"
    if p > PRICE_MAX_OK:
        return p, "too_high"
    return p, "ok"


def parse_coord(raw: str | None, lo: float, hi: float) -> float | None:
    value = clean_null(raw)
    if value is None:
        return None
    try:
        v = float(value)
    except ValueError:
        return None
    return v if lo <= v <= hi else None


def import_dataset(src: str, db_path: str) -> dict:
    if os.path.exists(db_path):
        os.remove(db_path)
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
    con = sqlite3.connect(db_path)
    con.executescript(SCHEMA)
    counts = {}

    # Shops (Tehran bounding box from audit: lat 35.5-36.0, lon 51.0-51.7)
    shop_ids = set()
    batch = []
    for r in _rows(os.path.join(src, "shops.csv")):
        shop_ids.add(r["shop_id"])
        batch.append((
            r["shop_id"], clean_null(r["name"]) or "", clean_null(r["address"]),
            clean_null(r["location_label"]),
            parse_coord(r["lat"], 35.5, 36.0), parse_coord(r["lon"], 51.0, 51.7),
            clean_null(r["category_names"]), clean_null(r["contacts"]),
            clean_null(r["website_url"]), clean_null(r["instagram"]),
            {"true": 1, "false": 0}.get((clean_null(r["supports_fast_delivery"]) or "").lower()),
            clean_null(r["weekly_hours"]), clean_null(r["payment_options"]),
        ))
    con.executemany("INSERT INTO shops VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", batch)
    counts["shops"] = len(batch)

    # Products
    product_ids = set()
    batch = []
    for r in _rows(os.path.join(src, "products.csv")):
        title = clean_null(r["persian_title"]) or ""
        product_ids.add(r["product_id"])
        specs = clean_null(r["specs"]) or "[]"
        batch.append((
            r["product_id"], title, normalize_text(title),
            clean_null(r["brand_name"]), clean_null(r["category_name"]),
            clean_null(r["model"]), clean_null(r["image_urls"]), specs,
            specs.count('"key"'),
        ))
        if len(batch) >= 5000:
            con.executemany("INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?)", batch)
            batch = []
    if batch:
        con.executemany("INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?)", batch)
    counts["products"] = len(product_ids)

    # Offers
    batch, skipped = [], {"unknown_product": 0, "unknown_shop": 0}
    for r in _rows(os.path.join(src, "offers.csv")):
        if r["product_id"] not in product_ids:
            skipped["unknown_product"] += 1
            continue
        if r["shop_id"] not in shop_ids:
            skipped["unknown_shop"] += 1
            continue
        price, status = classify_price(r["price_toman"])
        changed = clean_null(r["last_price_changed_at"])
        batch.append((
            r["offer_id"], r["product_id"], r["shop_id"], price, status, changed,
            clean_null(r["seller_title"]), clean_null(r["description"]),
            clean_null(r["warranty"]),
        ))
        if len(batch) >= 5000:
            con.executemany("INSERT INTO offers VALUES (?,?,?,?,?,?,?,?,?)", batch)
            batch = []
    if batch:
        con.executemany("INSERT INTO offers VALUES (?,?,?,?,?,?,?,?,?)", batch)
    counts["offers"] = con.execute("SELECT COUNT(*) FROM offers").fetchone()[0]
    counts["offers_skipped"] = skipped

    meta = {
        "imported_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "source_dir": os.path.abspath(src),
        "price_bounds_toman": f"{PRICE_MIN_OK}..{PRICE_MAX_OK}",
        **{f"count_{k}": str(v) for k, v in counts.items()},
    }
    con.executemany("INSERT INTO meta VALUES (?,?)", meta.items())
    con.commit()
    con.close()
    return counts


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--src", default="data/raw/torob-dataset")
    p.add_argument("--db", default="data/torob.sqlite")
    args = p.parse_args(argv)
    counts = import_dataset(args.src, args.db)
    print(counts)
    return 0


if __name__ == "__main__":
    sys.exit(main())

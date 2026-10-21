"""Core shopping tools. All results come from the SQLite dataset; no LLM involved.

Tools:
    search_products(query, filters)
    get_product_details(product_id)
    compare_offers(product_id, filters)
    find_shops(filters, location)
    find_alternatives(product_id, budget, preferences)
"""
from __future__ import annotations

import json
import math
import sqlite3
from dataclasses import dataclass
from typing import Any

from .normalize import normalize_text

DEFAULT_DB = "data/torob.sqlite"

# Named reference points in Tehran (verified coordinates are user-supplied or
# taken from the dataset; these are approximate centers used only for "near X").
NEIGHBORHOODS = {
    "صادقیه": (35.7467, 51.3360),
    "ولنجک": (35.7790, 51.3870),
    "ونک": (35.7650, 51.4120),
    "میدان ولیعصر": (35.6997, 51.4130),
    "تجریش": (35.8050, 51.4300),
    "شریعتی": (35.7600, 51.4330),
}
MAX_LIMIT = 100


@dataclass
class Filters:
    min_price: float | None = None
    max_price: float | None = None
    brand: str | None = None
    category: str | None = None
    near: tuple[float, float] | None = None
    radius_km: float | None = None
    fast_delivery: bool | None = None
    sort: str = "relevance"  # relevance | matching_offers | price_asc | price_desc | distance
    limit: int = 20
    offset: int = 0

    def validate(self) -> None:
        if self.sort not in {"relevance", "matching_offers", "price_asc", "price_desc", "distance"}:
            raise ValueError(f"invalid sort: {self.sort}")
        if self.min_price is not None and self.max_price is not None and self.min_price > self.max_price:
            raise ValueError("min_price > max_price")
        if self.min_price is not None and self.min_price < 0:
            raise ValueError("min_price < 0")
        if self.max_price is not None and self.max_price < 0:
            raise ValueError("max_price < 0")
        self.limit = max(1, min(int(self.limit), MAX_LIMIT))
        self.offset = max(0, int(self.offset))
        if self.near is not None:
            lat, lon = self.near
            if not (35.4 <= lat <= 36.1 and 50.9 <= lon <= 51.8):
                raise ValueError("location outside supported Tehran area")


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def resolve_location(text: str | None) -> tuple[float, float] | None:
    if not text:
        return None
    t = normalize_text(text)
    for name, coords in NEIGHBORHOODS.items():
        if normalize_text(name) in t:
            return coords
    return None


def _connection_mode(q_norm: str) -> str | None:
    has_wireless = "بی سیم" in q_norm or "wireless" in q_norm
    has_wired = "با سیم" in q_norm or "سیمی" in q_norm or "wired" in q_norm
    if has_wireless and not has_wired:
        return "wireless"
    if has_wired and not has_wireless:
        return "wired"
    return None


class ShoppingTools:
    def __init__(self, db_path: str = DEFAULT_DB):
        self.con = sqlite3.connect(db_path)
        self.con.row_factory = sqlite3.Row

    def close(self) -> None:
        self.con.close()

    # ------------------------------------------------------------------ search
    def search_products(self, query: str, filters: Filters | None = None) -> dict[str, Any]:
        f = filters or Filters()
        f.validate()

        q_norm = normalize_text(query)
        connection = _connection_mode(q_norm)
        terms = [t for t in q_norm.split() if len(t) > 1]
        if connection is not None:
            terms = [t for t in terms if t not in {"بی", "با", "سیم", "سیمی", "wireless", "wired"}]

        if not terms and connection is None:
            return _result([], 0, f, "empty_query")

        where, params = [], []
        if terms:
            for t in terms:
                where.append("p.title_norm LIKE ?")
                params.append(f"%{t}%")

        if connection == "wireless":
            where.append("(p.title_norm LIKE ? OR p.title_norm LIKE ?)")
            params += ["%بی سیم%", "%wireless%"]
            where.append("p.title_norm NOT LIKE ?")
            params.append("%با سیم%")
        elif connection == "wired":
            where.append("(p.title_norm LIKE ? OR p.title_norm LIKE ? OR p.title_norm LIKE ?)")
            params += ["%با سیم%", "%سیمی%", "%wired%"]

        if f.brand:
            where.append("p.brand = ?")
            params.append(f.brand)

        if f.category:
            where.append("p.category = ?")
            params.append(f.category)

        where_sql = " AND ".join(where) if where else "1=1"

        # Offer-level filters are applied via EXISTS so the product must have a
        # qualifying offer.
        offer_conds, offer_params = self._offer_conditions(f)
        offer_clause = f"AND EXISTS (SELECT 1 FROM offers o WHERE o.product_id = p.product_id {offer_conds})"

        total = self.con.execute(
            f"SELECT COUNT(*) FROM products p WHERE {where_sql} {offer_clause}",
            params + offer_params,
        ).fetchone()[0]

        if f.sort == "price_desc":
            order_sql = "min_price IS NULL, min_price DESC, p.title"
        elif f.sort == "matching_offers":
            order_sql = "offer_count DESC, min_price IS NULL, min_price ASC, p.title"
        else:
            order_sql = "min_price IS NULL, min_price ASC, p.title"

        rows = self.con.execute(
            f"""
            SELECT p.product_id, p.title, p.brand, p.category,
                   (SELECT MIN(o.price_toman) FROM offers o
                      WHERE o.product_id = p.product_id AND o.price_status = 'ok' {offer_conds}) AS min_price,
                   (SELECT COUNT(*) FROM offers o WHERE o.product_id = p.product_id {offer_conds}) AS offer_count,
                   p.image_urls
            FROM products p
            WHERE {where_sql} {offer_clause}
            ORDER BY {order_sql}
            LIMIT ? OFFSET ?
            """,
            # placeholder order: SELECT subqueries (2x offer), WHERE params, EXISTS offer, LIMIT/OFFSET
            offer_params + offer_params + params + offer_params + [f.limit, f.offset],
        ).fetchall()

        items = []
        for r in rows:
            items.append({
                "product_id": r["product_id"],
                "title": r["title"],
                "brand": r["brand"],
                "category": r["category"],
                "min_price_toman": r["min_price"],
                "offer_count": r["offer_count"],
                "image_url": _first_image(r["image_urls"]),
            })
        return _result(items, total, f, None)

    def _offer_conditions(self, f: Filters) -> tuple[str, list]:
        conds, params = [], []
        if f.min_price is not None:
            conds.append("AND o.price_status = 'ok' AND o.price_toman >= ?")
            params.append(f.min_price)
        if f.max_price is not None:
            conds.append("AND o.price_status = 'ok' AND o.price_toman <= ?")
            params.append(f.max_price)
        if f.fast_delivery is True:
            conds.append("AND o.shop_id IN (SELECT shop_id FROM shops WHERE supports_fast_delivery = 1)")
        elif f.fast_delivery is False:
            conds.append("AND o.shop_id IN (SELECT shop_id FROM shops WHERE supports_fast_delivery = 0)")
        if f.near is not None:
            lat, lon = f.near
            radius = f.radius_km or 5.0
            # bounding-box prefilter; exact distance applied in Python for shop lists
            dlat = radius / 111.0
            dlon = radius / (111.0 * math.cos(math.radians(lat)))
            conds.append(
                "AND o.shop_id IN (SELECT shop_id FROM shops WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?)"
            )
            params += [lat - dlat, lat + dlat, lon - dlon, lon + dlon]
        return " ".join(conds), params

    # ---------------------------------------------------------------- details
    def get_product_details(self, product_id: str) -> dict[str, Any] | None:
        if not product_id or not product_id.startswith("product_"):
            raise ValueError("invalid product_id")
        r = self.con.execute("SELECT * FROM products WHERE product_id = ?", (product_id,)).fetchone()
        if r is None:
            return None
        specs = json.loads(r["specs"] or "[]")
        return {
            "product_id": r["product_id"],
            "title": r["title"],
            "brand": r["brand"],
            "category": r["category"],
            "model": r["model"],
            "images": _all_images(r["image_urls"]),
            "specs": [
                {"section": s.get("section"), "key": s.get("key"), "value": s.get("value")}
                for s in specs
            ],
            "offer_count": self.con.execute(
                "SELECT COUNT(*) FROM offers WHERE product_id = ?", (product_id,)
            ).fetchone()[0],
        }

    # ---------------------------------------------------------------- compare
    def compare_offers(self, product_id: str, filters: Filters | None = None) -> dict[str, Any]:
        f = filters or Filters()
        f.validate()
        product = self.get_product_details(product_id)
        if product is None:
            return {"status": "not_found", "product": None, "offers": []}
        conds, params = self._offer_conditions(f)
        rows = self.con.execute(
            f"""
            SELECT o.offer_id, o.price_toman, o.price_status, o.price_changed_at,
                   o.seller_title, o.description, o.warranty,
                   s.shop_id, s.name AS shop_name, s.address, s.location_label,
                   s.lat, s.lon, s.supports_fast_delivery
            FROM offers o JOIN shops s ON s.shop_id = o.shop_id
            WHERE o.product_id = ? {conds}
            ORDER BY o.price_status != 'ok', o.price_toman ASC
            """,
            [product_id] + params,
        ).fetchall()
        offers = []
        for r in rows:
            d = None
            if f.near is not None and r["lat"] is not None:
                d = round(haversine_km(f.near, (r["lat"], r["lon"])), 2)
            if f.near is not None and f.radius_km is not None and (d is None or d > f.radius_km):
                continue
            offers.append({
                "offer_id": r["offer_id"],
                "price_toman": r["price_toman"],
                "price_status": r["price_status"],
                "price_changed_at": r["price_changed_at"],
                "seller_title": r["seller_title"],
                "warranty": _json_or_none(r["warranty"]),
                "shop": {
                    "shop_id": r["shop_id"],
                    "name": r["shop_name"],
                    "address": r["address"],
                    "location_label": r["location_label"],
                    "lat": r["lat"],
                    "lon": r["lon"],
                    "supports_fast_delivery": _bool_or_none(r["supports_fast_delivery"]),
                    "distance_km": d,
                },
            })
        if f.sort == "distance" and f.near is not None:
            offers.sort(key=lambda o: (o["shop"]["distance_km"] is None, o["shop"]["distance_km"] or 0))
        valid = [o["price_toman"] for o in offers if o["price_status"] == "ok"]
        summary = {
            "offer_count": len(offers),
            "min_price_toman": min(valid) if valid else None,
            "max_price_toman": max(valid) if valid else None,
            "spread_toman": (max(valid) - min(valid)) if valid else None,
        }
        return {"status": "ok" if offers else "no_offers", "product": product, "summary": summary,
                "offers": offers[f.offset:f.offset + f.limit]}

    # ------------------------------------------------------------------ shops
    def find_shops(self, filters: Filters | None = None, location: tuple[float, float] | None = None) -> dict[str, Any]:
        f = filters or Filters()
        if location is not None:
            f.near = location
        f.validate()

        conds, params = self._offer_conditions(Filters(
            max_price=f.max_price,
            min_price=f.min_price,
            fast_delivery=f.fast_delivery,
            near=f.near,
            radius_km=f.radius_km,
        ))

        if f.category:
            conds += " AND o.product_id IN (SELECT product_id FROM products WHERE category = ?)"
            params.append(f.category)
        if f.brand:
            conds += " AND o.product_id IN (SELECT product_id FROM products WHERE brand = ?)"
            params.append(f.brand)

        rows = self.con.execute(
            f"""
            SELECT s.shop_id, s.name, s.address, s.location_label, s.lat, s.lon,
                   s.supports_fast_delivery, COUNT(o.offer_id) AS matching_offers,
                   MIN(CASE WHEN o.price_status = 'ok' THEN o.price_toman END) AS best_price_toman
            FROM shops s JOIN offers o ON o.shop_id = s.shop_id
            WHERE 1=1 {conds}
            GROUP BY s.shop_id
            ORDER BY matching_offers DESC
            LIMIT 500
            """,
            params,
        ).fetchall()

        shops = []
        for r in rows:
            d = None
            if f.near is not None and r["lat"] is not None:
                d = round(haversine_km(f.near, (r["lat"], r["lon"])), 2)
                if f.radius_km is not None and d > f.radius_km:
                    continue
            shops.append({
                "shop_id": r["shop_id"],
                "name": r["name"],
                "address": r["address"],
                "location_label": r["location_label"],
                "lat": r["lat"],
                "lon": r["lon"],
                "supports_fast_delivery": _bool_or_none(r["supports_fast_delivery"]),
                "matching_offers": r["matching_offers"],
                "best_price_toman": r["best_price_toman"],
                "distance_km": d,
                "name_is_synthetic_warning": True,
            })

        if f.sort == "distance" and f.near is not None:
            shops.sort(key=lambda s: (s["distance_km"] is None, s["distance_km"] or 0))
        elif f.sort == "price_asc":
            shops.sort(key=lambda s: (s["best_price_toman"] is None, s["best_price_toman"] or 0, -s["matching_offers"]))
        elif f.sort == "price_desc":
            shops.sort(key=lambda s: (s["best_price_toman"] is None, -(s["best_price_toman"] or 0), -s["matching_offers"]))
        else:
            shops.sort(key=lambda s: (-s["matching_offers"], s["distance_km"] if s["distance_km"] is not None else 10**9))

        return {"status": "ok" if shops else "no_results", "total": len(shops),
                "shops": shops[f.offset:f.offset + f.limit]}

    # ------------------------------------------------------------ alternatives
    def find_alternatives(self, product_id: str, budget_toman: int | None = None,
                          limit: int = 10) -> dict[str, Any]:
        """Products in the same category whose cheapest valid offer fits the budget.

        Alternatives are only category/title-similarity based; the UI must label them as such.
        """
        base = self.get_product_details(product_id)
        if base is None:
            return {"status": "not_found", "alternatives": []}
        if budget_toman is not None and budget_toman <= 0:
            raise ValueError("budget must be positive")
        params: list[Any] = [base["category"], product_id]
        budget_sql = ""
        if budget_toman is not None:
            budget_sql = "HAVING min_price <= ?"
            params.append(budget_toman)
        rows = self.con.execute(
            f"""
            SELECT p.product_id, p.title, p.brand,
                   MIN(o.price_toman) AS min_price, COUNT(o.offer_id) AS offer_count
            FROM products p JOIN offers o ON o.product_id = p.product_id AND o.price_status = 'ok'
            WHERE p.category = ? AND p.product_id != ?
            GROUP BY p.product_id
            {budget_sql}
            ORDER BY min_price ASC
            LIMIT ?
            """,
            params + [limit],
        ).fetchall()
        return {
            "status": "ok" if rows else "no_results",
            "basis": "same_category",
            "alternatives": [dict(r) for r in rows],
        }

    # ------------------------------------------------------------- trip plan
    def plan_shopping_trip(self, items: list[dict], start: tuple[float, float] | None = None,
                           max_shops: int = 3) -> dict[str, Any]:
        """Greedy cheapest-offer assignment with a shop-count cap.

        For each item, choose among its offers; prefer fewer shops. Distances are
        straight-line (haversine) estimates, not routed travel times.
        """
        if not items:
            raise ValueError("items must not be empty")
        candidates = []
        for it in items:
            pid = it["product_id"]
            offers = self.compare_offers(pid, Filters(limit=MAX_LIMIT))["offers"]
            candidates.append({"product_id": pid, "offers": [o for o in offers if o["price_status"] == "ok"]})
        # Choose the single shop covering the most items at a reasonable total (simple heuristic).
        shop_cover: dict[str, dict] = {}
        for c in candidates:
            for o in c["offers"]:
                sid = o["shop"]["shop_id"]
                entry = shop_cover.setdefault(sid, {"shop": o["shop"], "items": {}, "total": 0})
                if c["product_id"] not in entry["items"]:
                    entry["items"][c["product_id"]] = o["price_toman"]
        ranked = sorted(shop_cover.values(), key=lambda e: (-len(e["items"]), sum(e["items"].values())))
        chosen = ranked[:max_shops]
        covered = {pid for e in chosen for pid in e["items"]}
        unmatched = [c["product_id"] for c in candidates if c["product_id"] not in covered]
        plan = []
        for e in chosen:
            d = None
            if start is not None and e["shop"]["lat"] is not None:
                d = round(haversine_km(start, (e["shop"]["lat"], e["shop"]["lon"])), 2)
            plan.append({
                "shop": e["shop"],
                "items": [{"product_id": pid, "price_toman": pr} for pid, pr in e["items"].items()],
                "subtotal_toman": sum(e["items"].values()),
                "straight_line_distance_km_from_start": d,
            })
        return {
            "status": "ok" if plan else "no_results",
            "assumptions": [
                "Only dataset offers with valid prices are used.",
                "Prices may have changed since last_price_changed_at.",
                "Distances are straight-line estimates, not routed travel times.",
            ],
            "plan": plan,
            "unmatched_product_ids": unmatched,
        }


def _result(items, total, f: Filters, reason: str | None) -> dict[str, Any]:
    return {
        "status": reason or ("ok" if items else "no_results"),
        "total": total,
        "limit": f.limit,
        "offset": f.offset,
        "items": items,
    }


def _first_image(raw: str | None) -> str | None:
    urls = _json_or_none(raw)
    return urls[0] if isinstance(urls, list) and urls else None


def _all_images(raw: str | None) -> list[str]:
    urls = _json_or_none(raw)
    return urls if isinstance(urls, list) else []


def _json_or_none(raw):
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


def _bool_or_none(v):
    return None if v is None else bool(v)

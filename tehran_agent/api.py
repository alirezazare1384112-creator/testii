"""Minimal HTTP API over ShoppingTools (stdlib only).

Run:
    python -m tehran_agent.api --db data/torob.sqlite --host 127.0.0.1 --port 8000
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from .tools import Filters, ShoppingTools, resolve_location


def _to_float(v: str | None) -> float | None:
    if v is None or v == "":
        return None
    return float(v)


def _to_int(v: str | None) -> int | None:
    if v is None or v == "":
        return None
    return int(v)


def _to_bool(v: str | None) -> bool | None:
    if v is None or v == "":
        return None
    val = v.strip().lower()
    if val in {"1", "true", "yes", "on"}:
        return True
    if val in {"0", "false", "no", "off"}:
        return False
    raise ValueError("invalid boolean")


def _single(qs: dict[str, list[str]], key: str) -> str | None:
    arr = qs.get(key)
    return arr[0] if arr else None


def _filters_from_qs(qs: dict[str, list[str]]) -> Filters:
    near = None
    near_text = _single(qs, "near")
    lat = _single(qs, "lat")
    lon = _single(qs, "lon")
    if lat and lon:
        near = (float(lat), float(lon))
    elif near_text:
        near = resolve_location(near_text)

    return Filters(
        min_price=_to_float(_single(qs, "min_price")),
        max_price=_to_float(_single(qs, "max_price")),
        brand=_single(qs, "brand"),
        category=_single(qs, "category"),
        near=near,
        radius_km=_to_float(_single(qs, "radius_km")),
        fast_delivery=_to_bool(_single(qs, "fast_delivery")),
        sort=_single(qs, "sort") or "relevance",
        limit=_to_int(_single(qs, "limit")) or 20,
        offset=_to_int(_single(qs, "offset")) or 0,
    )


def make_handler(db_path: str):
    class Handler(BaseHTTPRequestHandler):
        server_version = "TorobAgentHTTP/0.1"

        def do_GET(self):  # noqa: N802
            parsed = urlparse(self.path)
            path = parsed.path.rstrip("/") or "/"
            qs = parse_qs(parsed.query)
            tools = ShoppingTools(db_path)

            try:
                if path == "/":
                    return self._send(HTTPStatus.OK, {
                        "service": "tehran-shopping-agent",
                        "status": "ok",
                        "time": datetime.utcnow().isoformat() + "Z",
                        "routes": [
                            "/health",
                            "/api/meta",
                            "/api/search?q=...",
                            "/api/product/<product_id>",
                            "/api/compare/<product_id>",
                            "/api/shops",
                            "/api/alternatives/<product_id>",
                            "/api/trip?product_id=...&product_id=...",
                        ],
                    })

                if path == "/health":
                    return self._send(HTTPStatus.OK, {"status": "ok"})

                if path == "/api/meta":
                    rows = tools.con.execute("SELECT key, value FROM meta ORDER BY key").fetchall()
                    return self._send(HTTPStatus.OK, {"meta": {r["key"]: r["value"] for r in rows}})

                if path == "/api/search":
                    q = _single(qs, "q") or ""
                    data = tools.search_products(q, _filters_from_qs(qs))
                    return self._send(HTTPStatus.OK, data)

                if path.startswith("/api/product/"):
                    product_id = path.split("/")[-1]
                    data = tools.get_product_details(product_id)
                    if data is None:
                        return self._send(HTTPStatus.NOT_FOUND, {"status": "not_found"})
                    return self._send(HTTPStatus.OK, data)

                if path.startswith("/api/compare/"):
                    product_id = path.split("/")[-1]
                    data = tools.compare_offers(product_id, _filters_from_qs(qs))
                    status = HTTPStatus.OK if data.get("status") != "not_found" else HTTPStatus.NOT_FOUND
                    return self._send(status, data)

                if path == "/api/shops":
                    data = tools.find_shops(_filters_from_qs(qs))
                    return self._send(HTTPStatus.OK, data)

                if path.startswith("/api/alternatives/"):
                    product_id = path.split("/")[-1]
                    budget = _to_int(_single(qs, "budget_toman"))
                    limit = _to_int(_single(qs, "limit")) or 10
                    data = tools.find_alternatives(product_id, budget_toman=budget, limit=limit)
                    status = HTTPStatus.OK if data.get("status") != "not_found" else HTTPStatus.NOT_FOUND
                    return self._send(status, data)

                if path == "/api/trip":
                    pids = qs.get("product_id", [])
                    if not pids:
                        return self._send(HTTPStatus.BAD_REQUEST, {
                            "status": "invalid_request",
                            "error": "at least one product_id is required",
                        })

                    items = [{"product_id": pid} for pid in pids]
                    start = None
                    near_text = _single(qs, "near")
                    lat = _single(qs, "lat")
                    lon = _single(qs, "lon")
                    if lat and lon:
                        start = (float(lat), float(lon))
                    elif near_text:
                        start = resolve_location(near_text)

                    max_shops = _to_int(_single(qs, "max_shops")) or 3
                    data = tools.plan_shopping_trip(items, start=start, max_shops=max_shops)
                    return self._send(HTTPStatus.OK, data)

                return self._send(HTTPStatus.NOT_FOUND, {"status": "not_found"})

            except ValueError as e:
                return self._send(HTTPStatus.BAD_REQUEST, {"status": "invalid_request", "error": str(e)})
            except Exception as e:  # pragma: no cover
                return self._send(HTTPStatus.INTERNAL_SERVER_ERROR, {
                    "status": "error",
                    "error": str(e),
                })
            finally:
                tools.close()

        def log_message(self, fmt, *args):  # noqa: A003
            return

        def _send(self, code: HTTPStatus, payload: dict):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)

    return Handler


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--db", default="data/torob.sqlite")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8000)
    args = p.parse_args(argv)

    httpd = ThreadingHTTPServer((args.host, args.port), make_handler(args.db))
    try:
        print(f"Serving on http://{args.host}:{args.port}")
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Profile the Torob dataset CSVs (stdlib only). Usage: python scripts/audit_dataset.py <dir>"""
import csv
import sys
import json
import re
from collections import Counter

csv.field_size_limit(10**9)
DATA = sys.argv[1] if len(sys.argv) > 1 else "data/raw/torob-dataset"


def load(name):
    with open(f"{DATA}/{name}.csv", encoding="utf-8", newline="") as f:
        r = csv.DictReader(f)
        return r.fieldnames, list(r)


def is_missing(v):
    return v is None or v.strip() in ("", "null", "None", "nan", "NaN")


def profile(name, cols, rows):
    print(f"\n## {name}.csv rows={len(rows)} cols={len(cols)}")
    for c in cols:
        vals = [r[c] for r in rows]
        miss = sum(is_missing(v) for v in vals)
        uniq = len(set(vals))
        sample = next((v for v in vals if not is_missing(v)), "")
        print(f"- {c}: missing={miss} ({miss*100/len(rows):.1f}%) unique={uniq} sample={sample[:80]!r}")


report = {}
pc, products = load("products")
sc, shops = load("shops")
oc, offers = load("offers")
profile("products", pc, products)
profile("shops", sc, shops)
profile("offers", oc, offers)

# Duplicates
for name, rows, key in [("products", products, "product_id"), ("shops", shops, "shop_id"), ("offers", offers, "offer_id")]:
    cnt = Counter(r[key] for r in rows)
    d = sum(1 for v in cnt.values() if v > 1)
    print(f"\nduplicate {key} in {name}: {d}")

# Joins
prod_ids = {r["product_id"] for r in products}
shop_ids = {r["shop_id"] for r in shops}
off_pid_missing = sum(1 for r in offers if r["product_id"] not in prod_ids)
off_sid_missing = sum(1 for r in offers if r["shop_id"] not in shop_ids)
print(f"\noffers with product_id not in products: {off_pid_missing}")
print(f"offers with shop_id not in shops: {off_sid_missing}")
print(f"products without any offer: {len(prod_ids - {r['product_id'] for r in offers})}")
print(f"shops without any offer: {len(shop_ids - {r['shop_id'] for r in offers})}")

# Prices
bad_price, zero_price, prices = 0, 0, []
for r in offers:
    p = r["price_toman"].strip()
    if not re.fullmatch(r"-?\d+(\.\d+)?", p):
        bad_price += 1
        continue
    v = float(p)
    if v <= 0:
        zero_price += 1
    prices.append(v)
prices.sort()
if prices:
    n = len(prices)
    print(f"\nprice_toman: non-numeric={bad_price} zero/neg={zero_price} "
          f"min={prices[0]} p50={prices[n//2]} p90={prices[int(n*.9)]} p99={prices[int(n*.99)]} max={prices[-1]}")
    print("price > 1e9 count:", sum(1 for v in prices if v > 1e9))
    print("non-integer prices:", sum(1 for v in prices if v != int(v)))

# Timestamps
ts = [r["last_price_changed_at"] for r in offers if not is_missing(r["last_price_changed_at"])]
print(f"\nlast_price_changed_at present={len(ts)} min={min(ts)} max={max(ts)}")
print("timestamp formats:", Counter(re.sub(r"\d", "9", t)[:40] for t in ts).most_common(3))

# Coordinates
bad_coord = 0
lat_vals, lon_vals = [], []
for r in shops:
    la, lo = r["lat"], r["lon"]
    if is_missing(la) or is_missing(lo):
        continue
    try:
        la, lo = float(la), float(lo)
    except ValueError:
        bad_coord += 1
        continue
    lat_vals.append(la)
    lon_vals.append(lo)
print(f"\nshops with coords={len(lat_vals)} unparsable={bad_coord}")
if lat_vals:
    print(f"lat range {min(lat_vals)}..{max(lat_vals)}  lon range {min(lon_vals)}..{max(lon_vals)}")
    print("Tehran-bbox (35.5-36.0N, 51.0-51.7E) count:",
          sum(1 for a, b in zip(lat_vals, lon_vals) if 35.5 <= a <= 36.0 and 51.0 <= b <= 51.7))

# Category / brand / specs samples
print("\ntop categories:", Counter(r["category_name"] for r in products).most_common(8))
print("product brand missing:", sum(is_missing(r["brand_name"]) for r in products))
print("shop category_names sample:", [r["category_names"] for r in shops[:3]])
print("\nSample product:", json.dumps(products[0], ensure_ascii=False)[:600])
print("\nSample shop:", json.dumps(shops[0], ensure_ascii=False)[:600])

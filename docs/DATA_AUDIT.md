# Data Audit: Torob dataset

Source: `torob-dataset.zip` (extracted to `data/raw/torob-dataset/`). Audit script: `scripts/audit_dataset.py`. All figures below come from running that script and targeted probes against the real files.

## Files and row counts

| File | Rows | Columns |
|---|---|---|
| products.csv | 225,903 | product_id, persian_title, brand_name, category_name, model, image_urls, specs |
| shops.csv | 6,476 | shop_id, name, address, location_label, lat, lon, category_names, contacts, website_url, instagram, supports_fast_delivery, weekly_hours, payment_options |
| offers.csv | 331,506 | offer_id, product_id, shop_id, price_toman, last_price_changed_at, seller_title, description, warranty |

## Joins

- `product_id` and `shop_id` are unique in their tables, with no duplicates.
- Every offer joins to an existing product and shop (0 orphans in either direction).
- 2,684 shops (41%) have no offers. They are excluded from shop discovery by design.
- Every product has at least one offer.

## Field reliability

| Field | Status | Safe use |
|---|---|---|
| persian_title | 2 missing | Primary search text. Normalized into `title_norm`. |
| brand_name | 74.5% missing, values include the string `"null"` | Filter only where present. Never display a missing brand as a value. |
| model | 98.2% missing, string `"null"` | Not usable for matching. |
| category_name | 0% missing, 3,428 distinct values | Category grouping for alternatives. |
| specs | JSON list of `{section,key,value}`. 81,304 products (36%) have no specs. | Show as-is in details. Spec keys are inconsistent (e.g. `برند` vs `مدل`). Not used for filters yet. |
| image_urls | Present for all rows, JSON list | Show first image. Images may be missing at render time. |
| price_toman | 15,083 (4.5%) are the string `"null"`. 1,645 are between 1 and 999, and 1,037 exceed 1e9. Max is about 7.3e17. | Only prices with status `ok` (1,000 to 10,000,000,000 toman) are used for sorting, filters, and cheapest-price claims. Other values are kept with a flag and never shown as valid prices. |
| last_price_changed_at | 769 missing. Range is 2020-12-03 to 2026-10-13. | Shown as the price-change timestamp. Missing = "unknown". The README says data is about a week old, but timestamps go back to 2020, so the date is shown rather than assumed fresh. |
| shops.name | Synthetic per dataset description | Always shown with a synthetic-name warning. Never presented as a verified business name. |
| shops.contacts | Synthetic per dataset description | Stored raw. Not displayed as verified, not used for any automated contact. |
| shops.address | 1 missing | Shown when present. |
| lat / lon | All present; all fall inside Tehran (lat 35.64 to 35.81, lon 51.31 to 51.51) | Used for distance. Out-of-range values would be set to NULL on import. |
| shops.category_names | Present for all shops | Not proof that a shop sells a product. Never used to infer availability. |
| supports_fast_delivery | 75.3% missing | `NULL` = unknown, never "false". |
| website_url, instagram | 98.6% and 99.7% missing | Shown only when present. |
| warranty | 82.2% missing, often `{"description":null,...}` | Shown only when there is a description or period. |

## Price handling

- No currency conversion. All values are in toman as stated by the dataset.
- Values are integers in the file; no decimal separators or Persian digits were found in `price_toman`.
- Known issue: the search returns one 22-result set for "ماوس بی سیم" that includes "ماوس بی‌صدا ... با سیم" (wired). This is a substring match on "سیم". Phrase-aware matching is a known gap.

## Stock and freshness

The dataset does not contain stock information. Every offer is a listing record, not confirmed inventory. The UI must state this and show `price_changed_at` for each offer, or "unknown" when missing.

## Import design

`tehran_agent/importer.py` builds `data/torob.sqlite` with three normalized tables (`products`, `shops`, `offers`) and indexes on the join keys, price, title, and coordinates. Import is reproducible: the database is dropped and rebuilt from the CSVs each run, and a `meta` table records the source path, import time, and row counts. Raw CSVs are never modified.

Run: `python -m tehran_agent.importer --src data/raw/torob-dataset --db data/torob.sqlite`

Result on this dataset: 6,476 shops, 225,903 products, 331,506 offers, 0 skipped.

## Environment note

`pandas` could not be installed because the sandbox cannot reach PyPI. The audit and import use only the Python standard library (`csv`, `sqlite3`).

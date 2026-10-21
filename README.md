# Tehran Shopping Agent

A Persian shopping assistant for Tehran, grounded entirely in the Torob dataset.
Search, filters, offer comparison, and shop discovery run without any LLM.

**Status:** Phase 1–2 (data audit, import, core tools, tests). Frontend and agent UI are not built yet.

## Dataset setup

The dataset is not committed. Place `torob-dataset.zip` contents under `data/raw/torob-dataset/`
so that `shops.csv`, `products.csv`, and `offers.csv` are present.

## Run

Requires Python 3.10+ (standard library only; no pip installs needed).

```bash
# 1. Build the SQLite database from the CSVs (reproducible; drops and rebuilds)
python -m tehran_agent.importer --src data/raw/torob-dataset --db data/torob.sqlite

# 2. Run tests
python -m unittest discover -s tests -v
```

## Layout

- `tehran_agent/importer.py` — CSV → normalized SQLite import with price status flags
- `tehran_agent/normalize.py` — Persian text, null handling, budget parsing
- `tehran_agent/tools.py` — `search_products`, `get_product_details`, `compare_offers`, `find_shops`, `find_alternatives`, `plan_shopping_trip`
- `tests/test_core.py` — unit and database tests
- `scripts/audit_dataset.py` — dataset profiling
- `docs/DATA_AUDIT.md` — schema, field reliability, and limitations

## Data limitations

See [docs/DATA_AUDIT.md](docs/DATA_AUDIT.md). In short: shop names and contacts are synthetic,
prices may be about a week old or older, stock is not in the data, and about 4.5% of offers have no price.

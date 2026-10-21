# Tehran Shopping Agent (طرب‌گارد)

A Persian shopping assistant for Tehran, grounded entirely in the Torob dataset.
Search, filters, offer comparison, and shop discovery run without any LLM, and a
Persian RTL web UI plus an optional LLM shopping agent sit on top of the same data.

**Status:** Phase 1–2 (data audit, import, core tools, tests) **+ Phase 3 (Persian RTL
Next.js frontend, TypeScript tool port, LLM agent UI)**.

## Repository layout

This repo has two layers that share one SQLite database:

| Path | Layer | Language |
|---|---|---|
| `tehran_agent/` | Data import + core tools (source of truth) | Python |
| `tests/` | Tests for the Python tools | Python |
| `scripts/audit_dataset.py` | Dataset profiling | Python |
| `docs/DATA_AUDIT.md` | Schema, field reliability, limitations | — |
| `web/` | Persian RTL Next.js frontend + TS tool port + LLM agent UI | TypeScript |

The `web/` app ports `tehran_agent/tools.py` to TypeScript and reads the same
`data/torob.sqlite` produced by `tehran_agent/importer.py` — so the real dataset
drops in with no code changes. See [`web/README.md`](web/README.md) for run steps.

## Dataset setup

The dataset is not committed. Place `torob-dataset.zip` contents under `data/raw/torob-dataset/`
so that `shops.csv`, `products.csv`, and `offers.csv` are present.

## Run the Python tools

Requires Python 3.10+ (standard library only; no pip installs needed).

```bash
# 1. Build the SQLite database from the CSVs (reproducible; drops and rebuilds)
python -m tehran_agent.importer --src data/raw/torob-dataset --db data/torob.sqlite

# 2. Run tests
python -m unittest discover -s tests -v
```

## Run the web frontend

```bash
cd web
bun install
# Build a sample DB for development (or point at the real importer output):
node --experimental-strip-types scripts/seed-torob.ts
bun run dev   # http://localhost:3000
```

See [`web/README.md`](web/README.md) for details, including how to use the real
dataset and the phrase-match fix for «ماوس بی‌سیم» vs «ماوس با سیم».

## Layout

- `tehran_agent/importer.py` — CSV → normalized SQLite import with price status flags
- `tehran_agent/normalize.py` — Persian text, null handling, budget parsing
- `tehran_agent/tools.py` — `search_products`, `get_product_details`, `compare_offers`, `find_shops`, `find_alternatives`, `plan_shopping_trip`
- `tests/test_core.py` — unit and database tests
- `scripts/audit_dataset.py` — dataset profiling
- `docs/DATA_AUDIT.md` — schema, field reliability, and limitations
- `web/` — Next.js 16 + Tailwind 4 + shadcn/ui Persian RTL frontend, TS port of the tools, and an LLM agent over the 6 tools

## Data limitations

See [docs/DATA_AUDIT.md](docs/DATA_AUDIT.md). In short: shop names and contacts are synthetic,
prices may be about a week old or older, stock is not in the data, and about 4.5% of offers have no price.

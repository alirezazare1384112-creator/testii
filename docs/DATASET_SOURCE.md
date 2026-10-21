# Dataset source and integrity

This project uses the Torob challenge dataset archive:

- File name: `starcoach-dataset-v16-cap300-csv.zip`
- Expected repository path: `data/raw/starcoach-dataset-v16-cap300-csv.zip`
- SHA256: `b0afb47b2b70f65c6d8ec07b7423dcc49efc71cd7a27e95606fb81da008c210d`

## Build database from ZIP

```bash
python -m tehran_agent.importer --src data/raw/starcoach-dataset-v16-cap300-csv.zip --db data/torob.sqlite
```

## Verify checksum

```bash
python - <<'PY'
import hashlib
p='data/raw/starcoach-dataset-v16-cap300-csv.zip'
h=hashlib.sha256()
with open(p,'rb') as f:
    for c in iter(lambda:f.read(1024*1024), b''):
        h.update(c)
print(h.hexdigest())
PY
```

If the hash differs, do not trust the file for reproducible runs.

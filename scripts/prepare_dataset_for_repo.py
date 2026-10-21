"""Prepare Torob dataset archive inside repository data/raw.

This script copies (or optionally hard-links) a local ZIP archive into
`data/raw/` so the importer can consume it from a stable project path.

Usage:
    python scripts/prepare_dataset_for_repo.py --zip C:/Users/.../starcoach-dataset-v16-cap300-csv.zip
"""
from __future__ import annotations

import argparse
import hashlib
import os
import shutil
from pathlib import Path


DEFAULT_NAME = "starcoach-dataset-v16-cap300-csv.zip"


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--zip", required=True, help="Absolute or relative path to dataset ZIP")
    p.add_argument("--dest", default=f"data/raw/{DEFAULT_NAME}", help="Destination path inside repo")
    p.add_argument("--link", action="store_true", help="Try to hard-link instead of copy")
    args = p.parse_args(argv)

    src = Path(args.zip).expanduser().resolve()
    if not src.exists() or not src.is_file():
        raise SystemExit(f"source ZIP not found: {src}")

    dest = Path(args.dest).resolve()
    dest.parent.mkdir(parents=True, exist_ok=True)

    if dest.exists():
        dest.unlink()

    if args.link:
        try:
            os.link(src, dest)
        except OSError:
            shutil.copy2(src, dest)
    else:
        shutil.copy2(src, dest)

    print(f"prepared: {dest}")
    print(f"size_bytes: {dest.stat().st_size}")
    print(f"sha256: {sha256_of(dest)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

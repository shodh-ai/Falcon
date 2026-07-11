#!/usr/bin/env python3
"""Build civil-seed-data.json — curated from civil_TT.pdf + faculty TT PDFs."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(__file__).resolve().parent / "civil-seed-data.json"

SOURCE_PDFS = [
    "civil_TT.pdf",
    "jagriti_TT.pdf",
    "nagendra_TT.pdf",
    "pradeep_TT.pdf",
    "ravindra_TT.pdf",
]


def main() -> None:
    missing = [name for name in SOURCE_PDFS if not (ROOT / name).exists()]
    if missing:
        raise SystemExit(f"Missing Civil source PDFs at repo root: {', '.join(missing)}")
    if not DATA.exists():
        raise SystemExit(f"Missing curated seed file: {DATA}")
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    DATA.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Validated {len(SOURCE_PDFS)} PDFs; seed data at {DATA}")
    print(
        f"  Semesters: {', '.join(payload['semesters'].keys())}; "
        f"students: {len(payload['students'])}"
    )


if __name__ == "__main__":
    main()

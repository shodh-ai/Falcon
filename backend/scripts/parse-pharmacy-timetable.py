#!/usr/bin/env python3
"""Extract pharmacy timetable data from image-based PDF pages.

The source PDF is scanned (no embedded text). This script renders pages to PNG
and validates the curated slot catalog in pharmacy-seed-data.json.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    print("Install PyMuPDF: pip install pymupdf", file=sys.stderr)
    raise

ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / "pharmacy_TT.pdf"
DATA = Path(__file__).resolve().parent / "pharmacy-seed-data.json"
PAGE_DIR = Path(__file__).resolve().parent / "_pharmacy_tt_pages"


def render_pages() -> None:
    PAGE_DIR.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(PDF)
    for i in range(doc.page_count):
        page = doc[i]
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        out = PAGE_DIR / f"page_{i + 1}.png"
        pix.save(str(out))
        print(f"Rendered {out}")


def summarize_data() -> dict:
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    summary = {}
    for sem, block in payload["semesters"].items():
        summary[sem] = {
            "courses": len(block["courses"]),
            "slots": len(block["slots"]),
            "room": block["room"],
        }
    return summary


def main() -> None:
    if not PDF.exists():
        raise SystemExit(f"Missing PDF: {PDF}")
    if not DATA.exists():
        raise SystemExit(f"Missing curated data: {DATA}")

    render_pages()
    summary = summarize_data()
    print(json.dumps(summary, indent=2))
    print(f"Curated timetable catalog: {DATA}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Parse Pharmacy faculty workload Excel into normalized allocation rows."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("Install openpyxl: pip install openpyxl", file=sys.stderr)
    raise

ROOT = Path(__file__).resolve().parents[2]
XLSX = ROOT / "Pharmacy_Faculty_Workload_JULY -DEC. 2026.xlsx"
OUT = Path(__file__).resolve().parent / "pharmacy-workload-parsed.json"

FACULTY_EMAIL = {
    "DR HITESH KUMAR KINGER": "hitesh.kumar@mygyanvihar.com",
    "DR MANISH KUMAR GUPTA": "manish1.gupta@mygyanvihar.com",
    "MR MAHENDRA SAINI": "mahendra.saini@mygyanvihar.com",
    "DR AMIT KAUSHIK": "amit.kaushik@mygyanvihar.com",
}

SEM_MAP = {
    "1": "I",
    "3": "III",
    "5": "V",
    "7": "VII",
}


def norm_name(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().upper())


def split_lines(value) -> list[str]:
    if value is None:
        return []
    return [part.strip() for part in str(value).split("\n") if part.strip()]


def parse_workbook(path: Path) -> list[dict]:
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb["Faculty Workload"]
    rows: list[dict] = []
    current: dict | None = None

    for row in ws.iter_rows(min_row=3, values_only=True):
        if not row:
            continue
        if row[2]:
            current = {
                "faculty_name": str(row[2]).strip(),
                "faculty_email": FACULTY_EMAIL.get(norm_name(row[2])),
                "program": str(row[4]).strip() if row[4] else None,
            }
        if not current:
            continue

        sem_parts = split_lines(row[6])
        code_parts = split_lines(row[7])
        name_parts = split_lines(row[8])
        credit_parts = split_lines(row[9])

        for idx, sem_raw in enumerate(sem_parts):
            sem_num = re.sub(r"\D", "", sem_raw) or sem_raw
            sem = SEM_MAP.get(sem_num, sem_num)
            code = code_parts[idx] if idx < len(code_parts) else code_parts[0] if code_parts else None
            if not code or code == "-":
                continue
            code = re.sub(r"\s+", "", code.upper())
            rows.append(
                {
                    "faculty_name": current["faculty_name"],
                    "faculty_email": current["faculty_email"],
                    "program": current["program"],
                    "semester": sem,
                    "course_code": code,
                    "course_name": name_parts[idx] if idx < len(name_parts) else (name_parts[0] if name_parts else code),
                    "credits": credit_parts[idx] if idx < len(credit_parts) else None,
                }
            )

    return rows


def main() -> None:
    if not XLSX.exists():
        raise SystemExit(f"Missing workbook: {XLSX}")
    rows = parse_workbook(XLSX)
    OUT.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(f"Wrote {len(rows)} allocation rows to {OUT}")


if __name__ == "__main__":
    main()

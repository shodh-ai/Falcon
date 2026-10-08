#!/usr/bin/env python3
"""Parse official department PDF sources into normalized CSV inputs."""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
REPO = BACKEND.parent
DATA = BACKEND / "data" / "departments"

SEM_ROMAN = {1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII"}
ROMAN_SEM = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8}
EMAIL_RE = re.compile(r"[\w.+-]+@mygyanvihar\.com", re.I)


def read_pdf_text(path: Path) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise SystemExit("Install pypdf: pip3 install pypdf") from exc
    reader = PdfReader(str(path))
    chunks = []
    for page in reader.pages:
        chunks.append(page.extract_text() or "")
    return "\n".join(chunks)


ASSIGNMENT_RE = re.compile(
    r"^(I|II|III|IV|V|VI|VII|VIII)\s+(I|II|III|IV|V|VI|VII|VIII)\s+(.+?)\s+([\w\s./-]+?)\s+(\d{2,3})\s*$",
    re.I,
)
CODE_RE = re.compile(
    r"^(AE\d{3,4}P?|AG\d{3}|ME\s?\d{3,4}|DME\d{3}|UC\s?\d{3,4}|PC\s?\d{3}|PE\s?\d{3}|PT\s?\d{3}|SM\s?\d{3}|EM\s?\d{3}|UCFV-?\d|DEP\d{3}|BS-?\dD\d+|ME\dD\d+|SODECA-?\w+|UCTION)\b",
    re.I,
)


def norm_name(value: str) -> str:
    cleaned = re.sub(r"[^\w\s]", " ", (value or "").strip().lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def norm_code(value: str) -> str:
    return re.sub(r"[\s\-]", "", (value or "").strip().upper())


def lookup_faculty_email(email_map: dict[str, str], faculty_name: str) -> str:
    for candidate in (
        faculty_name,
        re.sub(r"\s*\(.*?\)", "", faculty_name or ""),
        re.sub(r"\s*asst\.?\s*prof\.?.*$", "", faculty_name or "", flags=re.I),
    ):
        email = email_map.get(norm_name(candidate))
        if email:
            return email
    return ""


def load_config(slug: str) -> dict:
    path = DATA / slug / "config.json"
    if not path.exists():
        raise SystemExit(f"Missing config: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def resolve(base: Path, rel: str | None) -> Path | None:
    if not rel:
        return None
    p = (REPO / rel).resolve()
    return p if p.exists() else None


def write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for row in rows:
            w.writerow(row)


def parse_students_pdf(path: Path, default_batch: str, default_section: str) -> list[dict]:
    text = read_pdf_text(path)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip() and not ln.strip().startswith("--")]

    identity_rows: list[tuple[str, str]] = []
    meta_rows: list[tuple[str, int]] = []
    mode = None

    for line in lines:
        low = line.lower()
        if low == "name email":
            mode = "identity"
            continue
        if low == "batch current_semester section_code":
            mode = "meta"
            continue

        if mode == "identity":
            email_match = EMAIL_RE.search(line)
            if not email_match:
                continue
            email = email_match.group(0).lower()
            name = line[: email_match.start()].strip()
            identity_rows.append((name, email))
        elif mode == "meta":
            parts = line.rsplit(maxsplit=1)
            if len(parts) == 2 and parts[1].isdigit():
                programme, sem = parts[0].strip(), int(parts[1])
                meta_rows.append((programme, sem))

    rows: list[dict] = []
    for idx, (name, email) in enumerate(identity_rows):
        programme = default_batch
        sem = ""
        if idx < len(meta_rows):
            programme, sem = meta_rows[idx]
        rows.append(
            {
                "student_name": name,
                "email": email,
                "programme": programme,
                "current_semester": sem,
                "section_code": default_section,
                "batch": programme,
            }
        )
    return rows


def parse_course_catalog(text: str) -> dict[str, dict]:
    catalog: dict[str, dict] = {}
    for line in text.splitlines():
        if line.strip().lower().startswith("course name"):
            continue
        m = re.match(
            r"^(.+?)\s+(\d+(?:\.\d+)?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+(?:\.\d+)?)?\s*(\d+(?:\.\d+)?)?",
            line.strip(),
        )
        if not m:
            continue
        name = m.group(1).strip()
        if len(name) < 4:
            continue
        catalog[norm_name(name)] = {
            "course_name": name,
            "credits": m.group(2),
            "lecture_hours": m.group(3),
            "tutorial_hours": m.group(4),
            "practical_hours": m.group(5),
            "half_load": m.group(6) or "0",
            "full_load": m.group(7) or m.group(6) or "0",
        }
    return catalog


def lookup_catalog(catalog: dict[str, dict], course_name: str, course_code: str) -> dict:
    for key in (norm_name(course_name), norm_name(course_code)):
        if key in catalog:
            return catalog[key]
    for meta in catalog.values():
        if norm_code(meta["course_name"]) == norm_code(course_code):
            return meta
    return {
        "course_name": course_name or course_code,
        "credits": "3",
        "lecture_hours": "3",
        "tutorial_hours": "0",
        "practical_hours": "0",
        "half_load": "0",
        "full_load": "4",
    }


def parse_assignment_line(line: str) -> dict | None:
    line = normalize_spaces(strip_designation_prefix(line))
    m = ASSIGNMENT_RE.match(line)
    if not m:
        # Fallback for split programme lines like "VII VII B.Tech (ME, EE, CE) UC 401 CE 0101,114"
        fallback = re.match(
            r"^(I|II|III|IV|V|VI|VII|VIII)\s+(I|II|III|IV|V|VI|VII|VIII)\s+(.+)$",
            line,
            re.I,
        )
        if fallback:
            tail = fallback.group(3)
            code_match = CODE_RE.search(tail)
            prog_match = re.match(r"^(.+?)\s+([\w\s./-]+?\s+\d{2,3})$", tail)
            if code_match and prog_match:
                course_token = prog_match.group(2)
                programme = prog_match.group(1)
                code = extract_course_code(course_token, line)
                if code:
                    sem_num = ROMAN_SEM.get(fallback.group(2).upper(), 3)
                    prog_code = re.search(r"(\d{2,3})\s*$", course_token)
                    return {
                        "programme": normalize_spaces(programme),
                        "semester": f"{SEM_ROMAN.get(sem_num, str(sem_num))}-A",
                        "course_code": code,
                        "programme_code": prog_code.group(1) if prog_code else "",
                        "raw_course_token": course_token,
                    }
        single = re.match(
            r"^(I|II|III|IV|V|VI|VII|VIII)\s+(.+?)\s+([\w][\w\s./-]*?)\s+(\d{2,3}|DP[- ]?\d{4})\s*$",
            line,
            re.I,
        )
        if single:
            sem_num = ROMAN_SEM.get(single.group(1).upper(), 3)
            programme = normalize_spaces(single.group(2))
            course_token = normalize_spaces(single.group(3))
            code = extract_course_code(course_token, line)
            if code:
                return {
                    "programme": programme,
                    "semester": f"{SEM_ROMAN.get(sem_num, str(sem_num))}-A",
                    "course_code": code,
                    "programme_code": single.group(4).replace(" ", "").replace("-", ""),
                    "raw_course_token": course_token,
                }
        # Agri shorthand cells like "III AE3002 118" or "AE3002 P 118"
        agri_short = re.match(
            r"^(?:(I|II|III|IV|V|VI|VII|VIII)\s+)?(AE\d{3,4}P?)\s*(?:P\s+)?(\d{2,3}|DP[- ]?\d{4})\s*$",
            line,
            re.I,
        )
        if agri_short:
            sem_token = agri_short.group(1) or "III"
            sem_num = ROMAN_SEM.get(sem_token.upper(), 3)
            course_token = agri_short.group(2)
            code = extract_course_code(course_token, line)
            if code:
                return {
                    "programme": "B.Tech (Agri.)",
                    "semester": f"{SEM_ROMAN.get(sem_num, str(sem_num))}-A",
                    "course_code": code,
                    "programme_code": agri_short.group(3).replace(" ", "").replace("-", ""),
                    "raw_course_token": course_token,
                }
        return None
    programme = normalize_spaces(m.group(3))
    course_token = normalize_spaces(m.group(4))
    code = extract_course_code(course_token, line)
    if not code:
        return None
    sem_num = ROMAN_SEM.get(m.group(2).upper(), 3)
    return {
        "programme": programme,
        "semester": f"{SEM_ROMAN.get(sem_num, str(sem_num))}-A",
        "course_code": code,
        "programme_code": m.group(5),
        "raw_course_token": course_token,
    }


def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def extract_course_code(token: str, line: str) -> str | None:
    token = normalize_spaces(token)
    match = CODE_RE.search(token) or CODE_RE.search(line)
    if not match:
        compact = norm_code(token.split()[0]) if token else ""
        if compact and len(compact) >= 3:
            return compact
        return None
    return norm_code(match.group(1))


def strip_designation_prefix(line: str) -> str:
    return re.sub(
        r"^(Asst\.\s*Professor-ME|Asst\.\s*Prof\.-Agri\.?\s*Engg\.?|HOD)\s+",
        "",
        line,
        flags=re.I,
    ).strip()


def map_programme_label(raw: str, cfg: dict) -> str:
    """Map PDF programme text to allocation program_name used in Falcon."""
    text = normalize_spaces(raw).lower()
    default = cfg.get("program_allocation_name") or cfg.get("program_display_name") or "B.Tech ME"
    if "agri" in text:
        return "B.Tech Agri"
    if "diploma" in text:
        if "me" in text or "(me" in text:
            return "Diploma ME"
        return "Diploma"
    if "me" in text or "b.tech" in text:
        return default
    return normalize_spaces(raw) or default


def extract_workload_matrix_lines(
    text: str,
    *,
    row_count: int = 8,
    column_count: int = 8,
) -> list[str]:
    chunk = text.split("-- 1 of 4 --")[0]
    raw = [normalize_spaces(ln) for ln in chunk.splitlines() if normalize_spaces(ln)]
    bounded: list[str] = []
    for ln in raw:
        if ln.lower().startswith("programme") and "code" in ln.lower():
            break
        bounded.append(ln)

    cells: list[str] = []
    buffer = ""
    for ln in bounded:
        candidate = normalize_spaces(strip_designation_prefix(f"{buffer} {ln}" if buffer else ln))
        if parse_assignment_line(candidate):
            cells.append(candidate)
            buffer = ""
            continue
        if re.search(r"\s(114|118|144)\s*$", candidate):
            cells.append(candidate)
            buffer = ""
            continue
        if re.match(r"^(I|II|III|IV|V|VI|VII|VIII)\s", candidate) or buffer:
            buffer = candidate
            continue
        if buffer:
            buffer = candidate
    target = row_count * column_count
    while len(cells) < target:
        cells.append("")
    return cells[:target]


def extract_workload_page(text: str) -> list[str]:
    chunk = text.split("-- 1 of 4 --")[0]
    return [normalize_spaces(ln) for ln in chunk.splitlines() if normalize_spaces(ln)]


def parse_programme_scan_workload(
    lines: list[str],
    cfg: dict,
    email_map: dict[str, str],
    catalog: dict[str, dict],
) -> list[dict]:
    mode = cfg.get("workload_extract_mode")
    if mode != "programme_scan":
        return []
    match_token = (cfg.get("workload_programme_match") or "Agri").lower()
    faculty = cfg.get("default_faculty") or {"name": "Faculty", "designation": ""}
    email = lookup_faculty_email(email_map, faculty["name"])
    program_name = cfg.get("program_allocation_name") or cfg.get("program_display_name")
    rows: list[dict] = []

    for line in lines:
        parsed = parse_assignment_line(line)
        if parsed and match_token in parsed["programme"].lower():
            meta = lookup_catalog(catalog, parsed["raw_course_token"], parsed["course_code"])
            rows.append(
                {
                    "faculty_name": faculty["name"],
                    "designation": faculty.get("designation", ""),
                    "programme": program_name,
                    "semester": parsed["semester"],
                    "course_code": parsed["course_code"],
                    "programme_code": parsed["programme_code"],
                    "course_name": meta["course_name"],
                    "credits": meta["credits"],
                    "lecture_hours": meta["lecture_hours"],
                    "tutorial_hours": meta["tutorial_hours"],
                    "practical_hours": meta["practical_hours"],
                    "weekly_contact_hours": meta["full_load"],
                    "half_load": meta["half_load"],
                    "full_load": meta["full_load"],
                    "total_load": meta["full_load"],
                    "faculty_email": email,
                }
            )
    rows.extend(parse_agri_inline_codes(lines, cfg, email_map, catalog))
    return rows


def parse_matrix_workload(
    text: str,
    cfg: dict,
    email_map: dict[str, str],
    catalog: dict[str, dict],
) -> list[dict]:
    matrix_cfg = cfg.get("workload_matrix") or {}
    columns = matrix_cfg.get("faculty_columns") or []
    row_count = int(matrix_cfg.get("rows") or 8)
    column_count = int(matrix_cfg.get("columns") or len(columns) or 8)
    column_faculty_map = matrix_cfg.get("column_faculty_map") or list(range(len(columns)))
    cell_faculty_overrides = {
        int(k): int(v)
        for k, v in (matrix_cfg.get("cell_faculty_overrides") or {}).items()
    }
    skip_columns = {int(x) for x in (matrix_cfg.get("skip_columns") or [])}

    assignment_lines = extract_workload_matrix_lines(
        text,
        row_count=row_count,
        column_count=column_count,
    )
    if not columns:
        return []

    workload: list[dict] = []

    for idx, line in enumerate(assignment_lines):
        if not line:
            continue
        parsed = parse_assignment_line(line)
        if not parsed:
            continue

        col_idx = idx // row_count
        if col_idx in skip_columns:
            continue
        if col_idx >= column_count:
            continue

        if idx in cell_faculty_overrides:
            fac_idx = cell_faculty_overrides[idx]
        elif col_idx < len(column_faculty_map):
            fac_idx = column_faculty_map[col_idx]
        else:
            fac_idx = col_idx

        if fac_idx >= len(columns):
            continue
        faculty = columns[fac_idx]
        email = lookup_faculty_email(email_map, faculty["name"])
        programme = map_programme_label(parsed["programme"], cfg)
        meta = lookup_catalog(catalog, parsed["raw_course_token"], parsed["course_code"])
        workload.append(
            {
                "faculty_name": faculty["name"],
                "designation": faculty.get("designation", ""),
                "programme": programme,
                "semester": parsed["semester"],
                "course_code": parsed["course_code"],
                "programme_code": parsed["programme_code"],
                "course_name": meta["course_name"],
                "credits": meta["credits"],
                "lecture_hours": meta["lecture_hours"],
                "tutorial_hours": meta["tutorial_hours"],
                "practical_hours": meta["practical_hours"],
                "weekly_contact_hours": meta["full_load"],
                "half_load": meta["half_load"],
                "full_load": meta["full_load"],
                "total_load": meta["full_load"],
                "faculty_email": email,
            }
        )
    return workload


def parse_agri_inline_codes(
    lines: list[str],
    cfg: dict,
    email_map: dict[str, str],
    catalog: dict[str, dict],
) -> list[dict]:
    if cfg.get("slug") != "agriculture":
        return []
    default_faculty = (cfg.get("workload_matrix") or {}).get("faculty_columns") or []
    faculty = default_faculty[0] if default_faculty else {"name": "Mr. Manoranjan Kumar", "designation": "Assistant Professor"}
    email = lookup_faculty_email(email_map, faculty["name"])
    program_name = cfg.get("program_allocation_name") or cfg.get("program_display_name")
    rows: list[dict] = []

    for line in lines:
        if "B.Tech (Agri.)" in line or "B.Tech (Agri" in line:
            continue
        m = CODE_RE.match(line.strip())
        if not m:
            continue
        code = norm_code(m.group(1))
        if not (code.startswith("AE") or code.startswith("AG") or code.startswith("BS")):
            continue
        meta = lookup_catalog(catalog, code, code)
        rows.append(
            {
                "faculty_name": faculty["name"],
                "designation": faculty.get("designation", ""),
                "programme": program_name,
                "semester": "III-A",
                "course_code": code,
                "programme_code": "",
                "course_name": meta["course_name"],
                "credits": meta["credits"],
                "lecture_hours": meta["lecture_hours"],
                "tutorial_hours": meta["tutorial_hours"],
                "practical_hours": meta["practical_hours"],
                "weekly_contact_hours": meta["full_load"],
                "half_load": meta["half_load"],
                "full_load": meta["full_load"],
                "total_load": meta["full_load"],
                "faculty_email": email,
            }
        )
    return rows


def dedupe_workload(rows: list[dict]) -> list[dict]:
    seen: set[tuple] = set()
    out: list[dict] = []
    for row in rows:
        key = (
            row.get("faculty_email", "").lower(),
            row.get("course_code", ""),
            row.get("semester", ""),
            row.get("programme", ""),
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


WORKLOAD_FIELDS = [
    "faculty_name",
    "designation",
    "programme",
    "semester",
    "course_code",
    "programme_code",
    "course_name",
    "credits",
    "lecture_hours",
    "tutorial_hours",
    "practical_hours",
    "weekly_contact_hours",
    "half_load",
    "full_load",
    "total_load",
    "faculty_email",
]


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Usage: parse-department-sources.py <department-slug>")

    slug = sys.argv[1].strip().lower()
    cfg = load_config(slug)
    base = DATA / slug
    email_map = json.loads((base / cfg["sources"]["faculty_email_map"]).read_text(encoding="utf-8"))

    students: list[dict] = []
    students_pdf = resolve(base, cfg["sources"].get("students_pdf"))
    if students_pdf:
        students = parse_students_pdf(
            students_pdf,
            cfg.get("default_student_batch", ""),
            cfg.get("default_section_code", "A"),
        )
        write_csv(
            base / cfg["sources"]["students_csv"],
            students,
            ["student_name", "email", "programme", "current_semester", "section_code", "batch"],
        )
        print(f"Wrote {len(students)} students -> {base / cfg['sources']['students_csv']}")

    workload_pdf = resolve(base, cfg["sources"].get("workload_pdf"))
    if workload_pdf:
        text = read_pdf_text(workload_pdf)
        catalog = parse_course_catalog(text)
        page_lines = extract_workload_page(text)
        if cfg.get("workload_extract_mode") == "programme_scan":
            workload = parse_programme_scan_workload(page_lines, cfg, email_map, catalog)
        else:
            workload = parse_matrix_workload(text, cfg, email_map, catalog)
        workload = dedupe_workload(workload)

        write_csv(base / cfg["sources"]["faculty_workload_csv"], workload, WORKLOAD_FIELDS)
        catalog_rows = [
            {
                "course_code": norm_code(row["course_code"]),
                "course_name": row["course_name"],
                "credits": row["credits"],
                "subject_type": "LAB"
                if "lab" in row["course_name"].lower() or row["course_code"].endswith("P")
                else "THEORY",
            }
            for row in workload
        ]
        write_csv(
            base / cfg["sources"]["course_catalog_csv"],
            dedupe_workload(catalog_rows),
            ["course_code", "course_name", "credits", "subject_type"],
        )
        print(f"Wrote {len(workload)} workload rows -> {base / cfg['sources']['faculty_workload_csv']}")
        print(f"Wrote {len(catalog_rows)} catalog rows -> {base / cfg['sources']['course_catalog_csv']}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Prepare a privacy-minimized, non-production Pharmacy LMS migration package.

This tool never imports data and never copies source passwords.  It converts the
four approved source files into deterministic staging CSVs, a source manifest,
and a fail-closed readiness report.  Missing HR/account/history evidence remains
an explicit blocker rather than being guessed.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable

try:
    import xlrd  # type: ignore
except ImportError:  # pragma: no cover - reported with an actionable message
    xlrd = None


PROGRAM_MAP = {
    "bachelor of pharmacy": ("BPHARM", "REGULAR"),
    "b. pharma - regular": ("BPHARM", "REGULAR"),
    "b. pharma - lateral entry": ("BPHARM", "LATERAL_ENTRY"),
    "diploma in pharmacy": ("DPHARM", "REGULAR"),
    "d. pharma - regular": ("DPHARM", "REGULAR"),
    "master of pharmacy (pharmaceutics)": ("MPHARM-PHARMACEUTICS", "REGULAR"),
    "m. pharma - pharmaceutics": ("MPHARM-PHARMACEUTICS", "REGULAR"),
}
MONTHS = {m: i for i, m in enumerate(
    ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    ) if m}
DATE_RE = re.compile(
    r"\b(\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+"
    r"(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b"
)
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def canonical_course_code(value: Any) -> str:
    return re.sub(r"[^A-Z0-9]", "", clean(value).upper())


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def rows_from_workbook(path: Path) -> list[dict[str, Any]]:
    # Some provider exports use a legacy .xls filename while the payload is
    # actually OOXML. Detect the container instead of trusting the extension.
    with path.open("rb") as stream:
        signature = stream.read(8)
    is_ooxml = signature.startswith(b"PK\x03\x04")

    if path.suffix.lower() == ".xls" and not is_ooxml:
        if xlrd is None:
            raise RuntimeError("Reading .xls requires xlrd; install department-import/requirements.txt")
        book = xlrd.open_workbook(path)
        sheet = book.sheet_by_index(0)
        headers = [clean(sheet.cell_value(0, c)) for c in range(sheet.ncols)]
        return [
            {headers[c]: sheet.cell_value(r, c) for c in range(sheet.ncols)}
            for r in range(1, sheet.nrows)
        ]

    try:
        from openpyxl import load_workbook
    except ImportError as exc:
        raise RuntimeError(
            "Reading OOXML workbooks requires openpyxl; install department-import/requirements.txt"
        ) from exc
    with path.open("rb") as workbook_stream:
        workbook = load_workbook(workbook_stream, data_only=True, read_only=True)
        sheet = workbook.worksheets[0]
        headers = [clean(cell.value) for cell in next(sheet.iter_rows())]
        rows = [
            {headers[i]: value for i, value in enumerate(values)}
            for values in sheet.iter_rows(min_row=2, values_only=True)
        ]
        workbook.close()
    return rows


def write_csv(path: Path, rows: Iterable[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fields})


def parse_subjects(path: Path) -> list[dict[str, Any]]:
    try:
        from docx import Document
    except ImportError as exc:
        raise RuntimeError(
            "Reading Word catalogues requires python-docx; install department-import/requirements.txt"
        ) from exc
    programme: str | None = None
    semester: int | None = None
    subjects: list[dict[str, Any]] = []
    for paragraph in Document(path).paragraphs:
        text = clean(paragraph.text.replace("\xa0", " "))
        if not text or text in {"Top of Form", "Bottom of Form"}:
            continue
        if text in {"B.PHARMACY", "D.Pharma", "M.Pharma"}:
            programme = text
            continue
        sem = re.fullmatch(r"Sem\s+(\d+)", text, re.IGNORECASE)
        if sem:
            semester = int(sem.group(1))
            continue
        match = re.match(r"([A-Z0-9]+(?:-[A-Z0-9]+)+)-(.+?)\(([^()]*)\)\s*$", text)
        if not match or programme is None or semester is None:
            raise ValueError(f"Unrecognized subject line: {text}")
        programme_id = {
            "B.PHARMACY": "BPHARM",
            "D.Pharma": "DPHARM",
            "M.Pharma": "MPHARM-PHARMACEUTICS",
        }[programme]
        subjects.append({
            "course_id": f"CRS-{canonical_course_code(match.group(1))}",
            "course_code": canonical_course_code(match.group(1)),
            "source_course_code": clean(match.group(1)),
            "course_name": clean(match.group(2)),
            "course_type": clean(match.group(3)).upper(),
            "programme_id": programme_id,
            "recommended_term": semester,
        })
    return subjects


def parse_faculty(path: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    rows = rows_from_workbook(path)
    roster: dict[str, dict[str, Any]] = {}
    allocations: list[dict[str, Any]] = []
    issues: list[dict[str, Any]] = []
    seen: set[tuple[str, str, int, str]] = set()
    grouped: dict[tuple[str, int, str], list[dict[str, Any]]] = defaultdict(list)

    for line, row in enumerate(rows, start=2):
        email = clean(row.get("Email")).lower()
        name = clean(row.get("Name"))
        programme_raw = clean(row.get("Program")).lower()
        programme = PROGRAM_MAP.get(programme_raw)
        code = canonical_course_code(row.get("Subject Code"))
        semester = int(float(row.get("Semester") or 0))
        if programme is None:
            issues.append({"line": line, "type": "UNKNOWN_PROGRAMME", "value": programme_raw})
            continue
        if not EMAIL_RE.fullmatch(email) or not email.endswith("@mygyanvihar.com"):
            issues.append({"line": line, "type": "INVALID_FACULTY_EMAIL", "value": email})
        roster[email] = {
            "faculty_name": name,
            "official_email": email,
            "programme_ids": "",
            "employee_id": "",
            "designation": "",
            "department_id": "PHARM",
            "employment_status": "",
            "academic_role_codes": "",
            "hr_reconciliation_status": "HR_MASTER_REQUIRED",
        }
        key = (email, code, semester, programme[0])
        if key in seen:
            issues.append({"line": line, "type": "DUPLICATE_ALLOCATION", "value": "|".join(map(str, key))})
            continue
        seen.add(key)
        allocation = {
            "allocation_id": f"ALLOC-{len(allocations) + 1:04d}",
            "course_code": code,
            "programme_id": programme[0],
            "semester": semester,
            "faculty_name": name,
            "faculty_email": email,
            "allocation_role": "PRIMARY_FACULTY",
            "credits": row.get("Credit") or "",
            "subject_type": clean(row.get("Subject Type")).upper(),
            "source_program_code": clean(row.get("Program Code")),
            "review_status": "READY",
        }
        allocations.append(allocation)
        grouped[(code, semester, programme[0])].append(allocation)

    programmes_by_email: dict[str, set[str]] = defaultdict(set)
    for allocation in allocations:
        programmes_by_email[allocation["faculty_email"]].add(allocation["programme_id"])
    for email, faculty in roster.items():
        faculty["programme_ids"] = "|".join(sorted(programmes_by_email[email]))

    for key, group in grouped.items():
        if len(group) > 1:
            for allocation in group:
                allocation["allocation_role"] = "REVIEW_REQUIRED"
                allocation["review_status"] = "PRIMARY_CO_FACULTY_CONFIRMATION_REQUIRED"
            issues.append({
                "line": "",
                "type": "SHARED_ALLOCATION_REVIEW",
                "value": f"{key[0]}|{key[1]}|{key[2]}",
            })
    return sorted(roster.values(), key=lambda x: x["official_email"]), allocations, issues


def reconcile_hr(faculty: list[dict[str, Any]], hr_path: Path | None) -> None:
    if hr_path is None:
        return
    rows = rows_from_workbook(hr_path)
    by_email = {
        clean(row.get("official_email") or row.get("Email") or row.get("email")).lower(): row
        for row in rows
    }
    for member in faculty:
        row = by_email.get(member["official_email"])
        if not row:
            member["hr_reconciliation_status"] = "MISSING_ACCOUNT"
            continue
        member["employee_id"] = clean(row.get("employee_id") or row.get("Employee ID"))
        member["designation"] = clean(row.get("designation") or row.get("Designation"))
        member["employment_status"] = clean(
            row.get("employment_status") or row.get("Employment Status") or row.get("status")
        ).upper()
        department = clean(row.get("department") or row.get("Department"))
        member["academic_role_codes"] = clean(row.get("academic_roles") or row.get("Roles"))
        if department.lower() != "pharmacy":
            member["hr_reconciliation_status"] = "WRONG_DEPARTMENT"
        elif member["employment_status"] not in {"ACTIVE", "VISITING"}:
            member["hr_reconciliation_status"] = "INACTIVE_OR_UNCONFIRMED"
        elif not member["employee_id"]:
            member["hr_reconciliation_status"] = "EMPLOYEE_ID_REQUIRED"
        else:
            member["hr_reconciliation_status"] = "MATCHED_ACTIVE"


def compare_existing_seed(
    subjects: list[dict[str, Any]], allocations: list[dict[str, Any]], seed_path: Path
) -> tuple[list[dict[str, Any]], set[str]]:
    if not seed_path.exists():
        return [], set()
    seed = json.loads(seed_path.read_text(encoding="utf-8"))
    supplied_subjects = {row["course_code"]: row for row in subjects}
    supplied_faculty: dict[str, set[str]] = defaultdict(set)
    for allocation in allocations:
        supplied_faculty[allocation["course_code"]].add(allocation["faculty_email"])
    seed_emails = {clean(value).lower() for value in seed.get("faculty", {}).values()}
    conflicts: list[dict[str, Any]] = []
    for semester, block in seed.get("semesters", {}).items():
        for course in block.get("courses", []):
            code = canonical_course_code(course.get("code"))
            supplied = supplied_subjects.get(code)
            if not supplied:
                conflicts.append({
                    "course_code": code,
                    "conflict_type": "SEED_ONLY_COURSE",
                    "seed_value": clean(course.get("name")),
                    "supplied_value": "",
                })
                continue
            if re.sub(r"\W", "", clean(course.get("name")).lower()) != re.sub(
                r"\W", "", supplied["course_name"].lower()
            ):
                conflicts.append({
                    "course_code": code,
                    "conflict_type": "COURSE_NAME",
                    "seed_value": clean(course.get("name")),
                    "supplied_value": supplied["course_name"],
                })
            faculty_key = clean(course.get("faculty"))
            seed_email = clean(seed.get("faculty", {}).get(faculty_key)).lower()
            if supplied_faculty.get(code) and seed_email not in supplied_faculty[code]:
                conflicts.append({
                    "course_code": code,
                    "conflict_type": "FACULTY_ASSIGNMENT",
                    "seed_value": seed_email,
                    "supplied_value": "|".join(sorted(supplied_faculty[code])),
                })
    return conflicts, seed_emails


def parse_students(path: Path, account_path: Path | None) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    rows = rows_from_workbook(path)
    account_map: dict[str, dict[str, Any]] = {}
    if account_path:
        for row in rows_from_workbook(account_path):
            enrollment = clean(row.get("enrollment_number") or row.get("Enrollment"))
            account_map[enrollment] = row

    students: list[dict[str, Any]] = []
    contacts: list[dict[str, Any]] = []
    exclusions: list[dict[str, Any]] = []
    for line, row in enumerate(rows, start=2):
        enrollment = clean(row.get("Enrollment"))
        admitted = (
            clean(row.get("Form Step")).lower() == "enrolled"
            and "process done" in clean(row.get("Admission Status")).lower()
            and enrollment.lower() not in {"", "n/a"}
        )
        if not admitted:
            exclusions.append({
                "line": line,
                "source_student_id": clean(row.get("SID")),
                "student_name": clean(row.get("Student Name")),
                "reason": "NOT_ADMITTED_OR_NO_ENROLLMENT",
            })
            continue
        programme_raw = clean(row.get("Course")).lower()
        programme = PROGRAM_MAP.get(programme_raw)
        if programme is None:
            exclusions.append({
                "line": line,
                "source_student_id": clean(row.get("SID")),
                "student_name": clean(row.get("Student Name")),
                "reason": f"UNKNOWN_PROGRAMME:{programme_raw}",
            })
            continue
        account = account_map.get(enrollment, {})
        official_email = clean(
            account.get("official_email") or account.get("Email")
        ).lower()
        source_semester = int(float(row.get("Sem") or 0))
        lateral = programme[1] == "LATERAL_ENTRY"
        mapped_term = clean(account.get("current_term") or account.get("Current Term"))
        current_term = int(float(mapped_term)) if mapped_term else ("" if lateral else source_semester)
        cohort_id = clean(account.get("cohort_id") or account.get("Cohort ID"))
        section_id = clean(account.get("section_id") or account.get("Section ID"))
        curriculum_scheme_id = clean(
            account.get("curriculum_scheme_id") or account.get("Curriculum Scheme ID")
        )
        mapping_ready = bool(
            official_email and current_term and cohort_id and section_id and curriculum_scheme_id
        )
        students.append({
            "student_record_id": f"STU-{enrollment}",
            "source_student_id": clean(row.get("SID")),
            "enrollment_number": enrollment,
            "student_name": clean(row.get("Student Name")),
            "official_email": official_email,
            "programme_id": programme[0],
            "admission_route": programme[1],
            "source_semester": source_semester,
            "current_term": current_term,
            "cohort_id": cohort_id,
            "section_id": section_id,
            "curriculum_scheme_id": curriculum_scheme_id,
            "admission_date": clean(row.get("Admission Date"))[:10],
            "academic_status": "ACTIVE",
            "mapping_status": (
                "READY" if mapping_ready
                else "LATERAL_TERM_CONFIRMATION_REQUIRED" if lateral and not current_term
                else "ACCOUNT_MAPPING_REQUIRED" if not official_email
                else "STRUCTURE_MAPPING_REQUIRED"
            ),
        })
        contacts.append({
            "enrollment_number": enrollment,
            "source_contact_email": clean(row.get("Email")).lower(),
            "contact_validation": (
                "LIKELY_DOMAIN_TYPO" if clean(row.get("Email")).lower().endswith("@gamil.com")
                else "SOURCE_CONTACT_ONLY"
            ),
        })
    return students, contacts, exclusions


def parse_calendar(path: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError(
            "Reading calendar PDFs requires pypdf; install department-import/requirements.txt"
        ) from exc
    reader = PdfReader(path)
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    title = re.search(r"ACADEMIC\s+CALEND[AE]R\s+(\d{4}-\d{2})", text, re.IGNORECASE)
    matches = list(DATE_RE.finditer(text))
    days: list[dict[str, Any]] = []
    blocks: list[dict[str, Any]] = []
    issues: list[dict[str, Any]] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        raw = clean(text[match.end():end])
        month = MONTHS[match.group(2)]
        year = 2026 if month >= 7 else 2027
        day = date(year, month, int(match.group(1)))
        academic_day = re.search(r"Academic\s*Day\s*(\d+)", raw, re.IGNORECASE)
        if "ACADEMIC HOLIDAY" in raw.upper():
            kind = "ACADEMIC_HOLIDAY"
        elif "SUMMER VACATION" in raw.upper():
            kind = "VACATION"
        elif match.group(3) == "Sun":
            kind = "SUNDAY"
        elif academic_day:
            kind = "ACADEMIC_DAY"
        else:
            kind = "UNCLASSIFIED"
        source_hash = sha256_text(f"{day.isoformat()}|{raw}")
        days.append({
            "calendar_date": day.isoformat(),
            "weekday": match.group(3),
            "academic_year": "2026-27",
            "kind_of_day": kind,
            "academic_day_number": academic_day.group(1) if academic_day else "",
            "source_hash": source_hash,
        })
        blocks.append({
            "calendar_date": day.isoformat(),
            "source_text": raw,
            "event_structuring_status": "REVIEW_REQUIRED" if raw else "NO_EVENT_TEXT",
            "source_hash": source_hash,
        })

    unique_dates = sorted({row["calendar_date"] for row in days})
    expected_start, expected_end = date(2026, 7, 1), date(2027, 6, 30)
    expected = []
    cursor = expected_start
    while cursor <= expected_end:
        expected.append(cursor.isoformat())
        cursor += timedelta(days=1)
    missing = sorted(set(expected) - set(unique_dates))
    duplicate_count = len(days) - len(unique_dates)
    if title and title.group(1) != "2026-27":
        issues.append({"type": "CALENDAR_TITLE_YEAR_MISMATCH", "value": title.group(1)})
    if missing:
        issues.append({"type": "CALENDAR_DATES_MISSING", "value": "|".join(missing)})
    if duplicate_count:
        issues.append({"type": "CALENDAR_DUPLICATE_DATES", "value": str(duplicate_count)})
    return days, blocks, issues


def build_readiness(
    subjects: list[dict[str, Any]], faculty: list[dict[str, Any]], allocations: list[dict[str, Any]],
    faculty_issues: list[dict[str, Any]], students: list[dict[str, Any]], exclusions: list[dict[str, Any]],
    calendar_days: list[dict[str, Any]], calendar_issues: list[dict[str, Any]], hr_supplied: bool,
    accounts_supplied: bool, seed_conflicts: list[dict[str, Any]], approvals: dict[str, Any],
) -> dict[str, Any]:
    blockers = []
    required_approvals = {
        "calendar_approved": ("CALENDAR_APPROVAL_REQUIRED", "Corrected or formally approved 2026-27 title required"),
        "calendar_events_structured": ("CALENDAR_EVENT_STRUCTURING_REQUIRED", "Source blocks require event/scope review before import"),
        "continuing_students_reconciled": ("CONTINUING_STUDENT_ROSTERS_REQUIRED", "Active senior B.Pharm, D.Pharm and M.Pharm cohorts are absent"),
        "lms_history_reconciled": ("LMS_HISTORY_EXPORT_REQUIRED", "Content, assessments, attempts, attendance, forums and files are absent"),
        "programme_structure_complete": ("PROGRAMME_STRUCTURE_REQUIRED", "Schemes, cohorts, sections, term IDs and offering dates are absent"),
        "production_directory_verified": ("PRODUCTION_DIRECTORY_RECONCILIATION_REQUIRED", "Live faculty account state remains unverified"),
        "dry_run_accepted": ("NON_PRODUCTION_DRY_RUN_REQUIRED", "Non-production import and reconciliation evidence is required"),
        "security_tests_passed": ("SECURITY_ACCEPTANCE_REQUIRED", "Tenant, department and programme isolation tests must pass"),
    }
    for key, (code, detail) in required_approvals.items():
        if approvals.get(key) is not True:
            blockers.append({"code": code, "detail": detail})
    if not hr_supplied or any(f["hr_reconciliation_status"] != "MATCHED_ACTIVE" for f in faculty):
        blockers.append({"code": "FACULTY_HR_RECONCILIATION_REQUIRED", "detail": "All faculty must match active HR records"})
    if not accounts_supplied or any(not s["official_email"] for s in students):
        blockers.append({"code": "STUDENT_ACCOUNT_MAPPING_REQUIRED", "detail": "Official Falcon account mapping is missing"})
    if any(
        not s["cohort_id"] or not s["section_id"] or not s["curriculum_scheme_id"]
        for s in students
    ):
        blockers.append({"code": "STUDENT_STRUCTURE_MAPPING_REQUIRED", "detail": "Every student requires scheme, cohort and section mappings"})
    if any(s["admission_route"] == "LATERAL_ENTRY" and not s["current_term"] for s in students):
        blockers.append({"code": "LATERAL_ENTRY_TERM_REQUIRED", "detail": "Five lateral-entry curricular terms require confirmation"})
    if faculty_issues:
        blockers.append({"code": "FACULTY_ALLOCATION_REVIEW_REQUIRED", "detail": f"{len(faculty_issues)} issue(s) require resolution"})
    unresolved_calendar_issues = [
        issue for issue in calendar_issues
        if not (
            issue.get("type") == "CALENDAR_TITLE_YEAR_MISMATCH"
            and approvals.get("calendar_approved") is True
        )
    ]
    if unresolved_calendar_issues:
        blockers.append({"code": "CALENDAR_SOURCE_REVIEW_REQUIRED", "detail": f"{len(unresolved_calendar_issues)} issue(s) require resolution"})
    if seed_conflicts and approvals.get("seed_supersession_approved") is not True:
        blockers.append({"code": "PROVISIONAL_SEED_SUPERSESSION_REQUIRED", "detail": f"{len(seed_conflicts)} seed conflict(s) require audited supersession"})

    return {
        "ready_for_production_import": len(blockers) == 0,
        "generated_at": datetime.now().astimezone().isoformat(),
        "counts": {
            "calendar_days": len(calendar_days),
            "subjects": len(subjects),
            "faculty": len(faculty),
            "allocations": len(allocations),
            "eligible_students": len(students),
            "excluded_students": len(exclusions),
            "programme_counts": dict(sorted(Counter(s["programme_id"] for s in students).items())),
        },
        "blockers": blockers,
        "checks": {
            "password_fields_exported": 0,
            "all_subjects_have_allocations": all(
                any(a["course_code"] == subject["course_code"] for a in allocations)
                for subject in subjects
            ),
            "calendar_expected_days": len(calendar_days) == 365,
            "approval_checklist_supplied": bool(approvals),
        },
    }


def markdown_report(readiness: dict[str, Any], issues: list[dict[str, Any]]) -> str:
    counts = readiness["counts"]
    status = (
        "**READY for controlled production import.** All recorded gates are satisfied."
        if readiness["ready_for_production_import"]
        else "**BLOCKED for production import.** The package is suitable for review and reconciliation only."
    )
    lines = [
        "# Pharmacy LMS migration staging report", "",
        f"Generated: {readiness['generated_at']}", "",
        "## Status", "",
        status, "",
        "## Counts", "",
        f"- Calendar days: {counts['calendar_days']}",
        f"- Subjects: {counts['subjects']}",
        f"- Unique faculty: {counts['faculty']}",
        f"- Faculty allocations: {counts['allocations']}",
        f"- Eligible students: {counts['eligible_students']}",
        f"- Excluded students: {counts['excluded_students']}", "",
        "## Blocking conditions", "",
    ]
    lines.extend(f"- `{item['code']}` - {item['detail']}" for item in readiness["blockers"])
    lines.extend(["", "## Source issues", ""])
    lines.extend(f"- `{item.get('type')}` - {item.get('value', '')}" for item in issues)
    lines.extend([
        "", "## Security", "",
        "- Source student passwords were deliberately not read into or written from the staging package.",
        "- Personal contact emails are isolated in `student-contact-reconciliation.csv` and are not login identities.",
        "- No database mutation is performed by this tool.", "",
    ])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--calendar", type=Path, required=True)
    parser.add_argument("--subjects", type=Path, required=True)
    parser.add_argument("--faculty", type=Path, required=True)
    parser.add_argument("--students", type=Path, required=True)
    parser.add_argument("--hr-master", type=Path)
    parser.add_argument("--student-accounts", type=Path)
    parser.add_argument("--approval-checklist", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    source_files = [args.calendar, args.subjects, args.faculty, args.students]
    if args.hr_master:
        source_files.append(args.hr_master)
    if args.student_accounts:
        source_files.append(args.student_accounts)
    if args.approval_checklist:
        source_files.append(args.approval_checklist)
    manifest = [{
        "filename": path.name,
        "byte_size": path.stat().st_size,
        "sha256": sha256_file(path),
        "classification": "CONFIDENTIAL",
    } for path in source_files]

    subjects = parse_subjects(args.subjects)
    faculty, allocations, faculty_issues = parse_faculty(args.faculty)
    seed_path = Path(__file__).resolve().parents[1] / "pharmacy-seed-data.json"
    seed_conflicts, seed_emails = compare_existing_seed(subjects, allocations, seed_path)
    for member in faculty:
        member["committed_seed_presence"] = (
            "PRESENT_IN_SEED" if member["official_email"] in seed_emails else "NOT_IN_SEED"
        )
    reconcile_hr(faculty, args.hr_master)
    students, contacts, exclusions = parse_students(args.students, args.student_accounts)
    days, blocks, calendar_issues = parse_calendar(args.calendar)
    approvals = (
        json.loads(args.approval_checklist.read_text(encoding="utf-8"))
        if args.approval_checklist else {}
    )

    credits = defaultdict(list)
    for allocation in allocations:
        credits[allocation["course_code"]].append(allocation["credits"])
    for subject in subjects:
        values = {clean(v) for v in credits[subject["course_code"]] if clean(v)}
        subject["credits"] = next(iter(values)) if len(values) == 1 else ""
        subject["credit_review_status"] = "READY" if len(values) == 1 else "REVIEW_REQUIRED"

    write_csv(args.out / "source-manifest.csv", manifest, ["filename", "byte_size", "sha256", "classification"])
    write_csv(args.out / "calendar-days.csv", days, ["calendar_date", "weekday", "academic_year", "kind_of_day", "academic_day_number", "source_hash"])
    write_csv(args.out / "calendar-source-blocks.csv", blocks, ["calendar_date", "source_text", "event_structuring_status", "source_hash"])
    write_csv(args.out / "course-catalog-staging.csv", subjects, ["course_id", "course_code", "source_course_code", "course_name", "credits", "course_type", "programme_id", "recommended_term", "credit_review_status"])
    write_csv(args.out / "faculty-roster-staging.csv", faculty, ["faculty_name", "official_email", "programme_ids", "employee_id", "designation", "department_id", "employment_status", "academic_role_codes", "hr_reconciliation_status", "committed_seed_presence"])
    write_csv(args.out / "faculty-allocations-staging.csv", allocations, ["allocation_id", "course_code", "programme_id", "semester", "faculty_name", "faculty_email", "allocation_role", "credits", "subject_type", "source_program_code", "review_status"])
    write_csv(args.out / "students-staging.csv", students, ["student_record_id", "source_student_id", "enrollment_number", "student_name", "official_email", "programme_id", "admission_route", "source_semester", "current_term", "cohort_id", "section_id", "curriculum_scheme_id", "admission_date", "academic_status", "mapping_status"])
    write_csv(args.out / "student-contact-reconciliation.csv", contacts, ["enrollment_number", "source_contact_email", "contact_validation"])
    write_csv(args.out / "student-exclusions.csv", exclusions, ["line", "source_student_id", "student_name", "reason"])

    all_issues = faculty_issues + calendar_issues
    write_csv(args.out / "source-issues.csv", all_issues, ["line", "type", "value"])
    write_csv(args.out / "provisional-seed-conflicts.csv", seed_conflicts, ["course_code", "conflict_type", "seed_value", "supplied_value"])
    readiness = build_readiness(
        subjects, faculty, allocations, faculty_issues, students, exclusions,
        days, calendar_issues, bool(args.hr_master), bool(args.student_accounts), seed_conflicts,
        approvals,
    )
    (args.out / "readiness.json").write_text(json.dumps(readiness, indent=2), encoding="utf-8")
    (args.out / "README.md").write_text(markdown_report(readiness, all_issues), encoding="utf-8")
    print(json.dumps(readiness, indent=2))


if __name__ == "__main__":
    main()

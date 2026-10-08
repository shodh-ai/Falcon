#!/usr/bin/env python3
"""Generate B.Tech ME timetable/workload SQL migration from me-seed-data.json."""

from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).resolve().parent / "me-seed-data.json"
OUT = Path(__file__).resolve().parents[1] / "migrations" / "20260713140000_me_timetable_workload_seed.sql"


def sql_str(value: str) -> str:
    return value.replace("'", "''")


def main() -> None:
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    faculty = payload["faculty"]
    program = payload["program_name"]
    batch = "B.Tech ME"
    year = payload["academic_year"]
    dept = payload["dept_name"]

    catalog = {c["code"]: c for c in payload["catalog"]}
    allocations: list[tuple] = []
    batch_slots: list[tuple] = []
    faculty_slots: list[tuple] = []

    for sem, block in payload["semesters"].items():
        room = block["room"]
        section = block.get("section", "A")
        sem_label = f"{sem}-{section}"
        for course in block["courses"]:
            email = faculty.get(course["faculty"], faculty["HOD"])
            allocations.append((course["code"], program, sem_label, email))
        for slot in block["slots"]:
            email = faculty.get(slot.get("faculty", course_faculty(catalog, slot["course"])), faculty["HOD"])
            batch_slots.append(
                (
                    slot["course"],
                    sem_label,
                    slot.get("room", room),
                    slot["day"],
                    slot["start"],
                    slot["end"],
                    email,
                    section,
                )
            )

    for slot in payload["faculty_timetable_slots"]:
        email = faculty.get(slot["faculty"], faculty["HOD"])
        sem_label = f"{slot['semester']}-A"
        faculty_slots.append(
            (
                slot["course"],
                sem_label,
                slot.get("room", "ME Faculty Room"),
                slot["day"],
                slot["start"],
                slot["end"],
                email,
                "A",
            )
        )

    def slot_priority(source: str, room: str, sem_label: str, course_code: str) -> tuple:
        """Higher tuple wins when deduping timetable rows (ON CONFLICT is per course+time)."""
        catalog_sem = catalog.get(course_code, {}).get("semester", "")
        sem_match = 1 if catalog_sem and sem_label.startswith(catalog_sem) else 0
        real_room = 1 if room and room != "ME Faculty Room" else 0
        batch = 1 if source == "batch" else 0
        return (batch, real_room, sem_match)

    deduped_slots: dict[tuple, tuple] = {}
    for source, slots in (("batch", batch_slots), ("faculty", faculty_slots)):
        for row in slots:
            code, sem_label, room, day, start, end, email, section = row
            key = (code, day, start, end)
            candidate = (slot_priority(source, room, sem_label, code), row)
            existing = deduped_slots.get(key)
            if existing is None or candidate[0] > existing[0]:
                deduped_slots[key] = candidate
    timetable_slots = [row for _, row in deduped_slots.values()]

    seen_alloc: set[tuple] = set()
    merged: list[tuple] = []
    for row in allocations:
        if row in seen_alloc:
            continue
        seen_alloc.add(row)
        merged.append(row)
    for code, course in catalog.items():
        sem = course.get("semester", "III")
        sem_label = f"{sem}-A"
        key = (code, program, sem_label, faculty.get(course["faculty"], faculty["HOD"]))
        if (key[0], key[1], key[2], key[3]) in {(a[0], a[1], a[2], a[3]) for a in merged}:
            continue
        if any(a[0] == code and a[2] == sem_label for a in merged):
            continue
        merged.append((code, program, sem_label, key[3]))
    allocations = merged

    subject_values = []
    for code, course in sorted(catalog.items()):
        short = code[:8]
        subject_values.append(
            f"  ('{sql_str(code)}', '{sql_str(course['name'])}', '{sql_str(short)}', "
            f"{course['credits']}, '{course['type']}')"
        )

    alloc_values = [
        f"  ('{sql_str(code)}', '{sql_str(prog)}', '{sem}', '{sql_str(email)}')"
        for code, prog, sem, email in allocations
    ]

    def slot_lines(slots: list[tuple]) -> list[str]:
        lines = []
        for code, sem, room, day, start, end, email, section in slots:
            lines.append(
                f"  ('{sql_str(code)}', '{sem}', '{sql_str(room)}', '{section}', {day}, "
                f"'{start}'::time, '{end}'::time, '{sql_str(email)}')"
            )
        return lines

    slot_values = slot_lines(timetable_slots)

    student_updates = [
        f"  ('{sql_str(s['email'].lower())}', {s['semester']}, '{sql_str(s.get('section', 'A'))}')"
        for s in payload["students"]
    ]

    mentorship_values = [
        f"  ({sem_num}, '{sql_str(faculty[mentor_key])}')"
        for sem_num, mentor_key in payload["mentorship_by_semester"].items()
    ]

    prog_code = payload.get("program_code", "BTECH-ME")

    sql = f"""-- B.Tech ME timetable + workload seed (Sem III / V / VII Batch A)
-- Source: B.Tech (ME) Updated Time Table.pdf + faculty TT (Amit, Himanshu, Neeraj, Raj)
-- Faculty scope: Amit Tiwari, Himanshu Vasnani, Neeraj Kumar (HOD), Raj Kumar

-- ---------------------------------------------------------------------------
-- 1. HOD hierarchy
-- ---------------------------------------------------------------------------
UPDATE departments d
SET hod_user_id = u.user_id, updated_at = NOW()
FROM users u
WHERE d.dept_name = '{sql_str(dept)}'
  AND lower(u.official_email) = lower('{sql_str(payload["hod_email"])}');

UPDATE users u
SET reporting_officer_id = hod.user_id, updated_at = NOW()
FROM users hod
WHERE lower(hod.official_email) = lower('{sql_str(payload["hod_email"])}')
  AND lower(u.official_email) IN (
    '{sql_str(faculty["AMIT"])}',
    '{sql_str(faculty["HIMANSHU"])}',
    '{sql_str(faculty["RAJ"])}'
  );

-- ---------------------------------------------------------------------------
-- 2. ME student profiles (Batch A, sem 3/5/7)
-- ---------------------------------------------------------------------------
UPDATE student_profiles sp
SET
  current_semester = v.sem,
  batch = '{sql_str(batch)}',
  section_code = v.section_code,
  updated_at = NOW()
FROM users u
JOIN (VALUES
{',\n'.join(student_updates)}
) AS v(email, sem, section_code) ON lower(u.official_email) = lower(v.email)
JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = '{sql_str(dept)}'
WHERE sp.user_id = u.user_id;

-- ---------------------------------------------------------------------------
-- 3. B.Tech ME program + subjects + courses
-- ---------------------------------------------------------------------------
INSERT INTO iam_programs (program_name, program_code, duration_years)
SELECT '{sql_str(batch)}', '{sql_str(prog_code)}', 4
WHERE NOT EXISTS (
  SELECT 1 FROM iam_programs WHERE upper(program_code) = '{sql_str(prog_code)}' AND deleted_at IS NULL
);

WITH prog AS (
  SELECT program_id FROM iam_programs
  WHERE upper(program_code) = '{sql_str(prog_code)}' AND deleted_at IS NULL
  LIMIT 1
)
INSERT INTO academic_subjects (subject_code, subject_name, subject_shortname, program_id, credits, subject_type, is_active)
SELECT v.subject_code, v.subject_name, v.subject_shortname, p.program_id, v.credits, v.subject_type, true
FROM prog p
CROSS JOIN (VALUES
{',\n'.join(subject_values)}
) AS v(subject_code, subject_name, subject_shortname, credits, subject_type)
ON CONFLICT (subject_code) DO UPDATE SET
  subject_name = EXCLUDED.subject_name,
  subject_shortname = EXCLUDED.subject_shortname,
  credits = EXCLUDED.credits,
  subject_type = EXCLUDED.subject_type,
  is_active = true,
  updated_at = NOW();

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
subject_rows AS (
  SELECT subject_id, subject_code, subject_name, credits, subject_type
  FROM academic_subjects
  WHERE subject_code IN ({', '.join(f"'{sql_str(c)}'" for c in sorted(catalog))})
)
INSERT INTO academic_courses (tenant_id, course_code, course_name, credits, is_elective, course_type)
SELECT
  t.tenant_id,
  s.subject_code,
  s.subject_name,
  s.credits,
  false,
  CASE WHEN s.subject_type = 'LAB' THEN 'LAB' ELSE 'CORE' END
FROM tenant t
CROSS JOIN subject_rows s
ON CONFLICT (tenant_id, course_code) DO UPDATE SET
  course_name = EXCLUDED.course_name,
  credits = EXCLUDED.credits,
  course_type = EXCLUDED.course_type;

-- ---------------------------------------------------------------------------
-- 4. Course allocations
-- ---------------------------------------------------------------------------
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
subject_rows AS (
  SELECT subject_id, subject_code FROM academic_subjects
),
course_rows AS (
  SELECT course_id, course_code FROM academic_courses
),
allocations AS (
  SELECT * FROM (VALUES
{',\n'.join(alloc_values)}
  ) AS a(subject_code, program_name, semester, faculty_email)
)
INSERT INTO academic_course_allocations (
  tenant_id, subject_id, program_name, semester, faculty_user_id, academic_year, course_id, status
)
SELECT
  t.tenant_id,
  s.subject_id,
  a.program_name,
  a.semester,
  u.user_id,
  '{year}',
  c.course_id,
  'ACTIVE'
FROM allocations a
JOIN subject_rows s ON s.subject_code = a.subject_code
JOIN course_rows c ON c.course_code = s.subject_code
JOIN users u ON lower(u.official_email) = lower(a.faculty_email)
CROSS JOIN tenant t
ON CONFLICT (tenant_id, subject_id, program_name, semester, academic_year) DO UPDATE SET
  faculty_user_id = EXCLUDED.faculty_user_id,
  course_id = EXCLUDED.course_id,
  status = 'ACTIVE',
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 5. Timetable slots (student grid + faculty individual TT)
-- ---------------------------------------------------------------------------
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
course_rows AS (
  SELECT course_id, course_code FROM academic_courses
),
slot_rows AS (
  SELECT * FROM (VALUES
{',\n'.join(slot_values)}
  ) AS s(course_code, semester, room, section, day_of_week, start_time, end_time, faculty_email)
)
INSERT INTO academic_timetables (tenant_id, course_id, day_of_week, start_time, end_time, room, faculty_user_id, section)
SELECT
  t.tenant_id,
  c.course_id,
  s.day_of_week,
  s.start_time,
  s.end_time,
  s.room,
  u.user_id,
  s.section
FROM slot_rows s
JOIN course_rows c ON c.course_code = s.course_code
JOIN users u ON lower(u.official_email) = lower(s.faculty_email)
CROSS JOIN tenant t
ON CONFLICT (tenant_id, course_id, day_of_week, start_time, end_time)
WHERE deleted_at IS NULL
DO UPDATE SET
  room = EXCLUDED.room,
  faculty_user_id = EXCLUDED.faculty_user_id,
  section = EXCLUDED.section;

-- ---------------------------------------------------------------------------
-- 6. Student course enrollments (ME sem 3/5/7 Batch A)
-- ---------------------------------------------------------------------------
WITH me_students AS (
  SELECT u.user_id, sp.tenant_id, sp.current_semester, sp.section_code, sp.batch
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = '{sql_str(dept)}'
  WHERE sp.current_semester IN (3, 5, 7)
    AND sp.batch = '{sql_str(batch)}'
    AND sp.section_code = 'A'
),
matching_allocations AS (
  SELECT
    s.user_id,
    s.tenant_id,
    s.current_semester,
    s.section_code,
    a.course_id
  FROM me_students s
  JOIN academic_course_allocations a ON a.tenant_id = s.tenant_id
  WHERE a.academic_year = '{year}'
    AND a.status = 'ACTIVE'
    AND a.course_id IS NOT NULL
    AND upper(replace(COALESCE(a.program_name, ''), ' ', '')) = upper(replace('{sql_str(program)}', ' ', ''))
    AND (
      s.section_code IS NULL
      OR upper(split_part(COALESCE(a.semester, ''), '-', 2)) = upper(s.section_code)
      OR split_part(COALESCE(a.semester, ''), '-', 2) = ''
    )
    AND CASE upper(split_part(COALESCE(a.semester, ''), '-', 1))
      WHEN 'I' THEN 1 WHEN 'II' THEN 2 WHEN 'III' THEN 3 WHEN 'IV' THEN 4
      WHEN 'V' THEN 5 WHEN 'VI' THEN 6 WHEN 'VII' THEN 7 WHEN 'VIII' THEN 8
      ELSE NULL END = s.current_semester
)
INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, section_code, status)
SELECT tenant_id, user_id, course_id, current_semester, section_code, 'ENROLLED'
FROM matching_allocations
ON CONFLICT (tenant_id, student_user_id, course_id) DO UPDATE SET
  semester = EXCLUDED.semester,
  section_code = EXCLUDED.section_code,
  status = CASE
    WHEN student_course_enrollments.status = 'COMPLETED' THEN student_course_enrollments.status
    ELSE 'ENROLLED'
  END;

-- ---------------------------------------------------------------------------
-- 7. Faculty mentorships
-- ---------------------------------------------------------------------------
WITH mentor_map AS (
  SELECT * FROM (VALUES
{',\n'.join(mentorship_values)}
  ) AS m(semester_num, mentor_email)
),
me_students AS (
  SELECT u.user_id, sp.current_semester
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = '{sql_str(dept)}'
  WHERE sp.batch = '{sql_str(batch)}' AND sp.current_semester IN (3, 5, 7) AND sp.section_code = 'A'
)
INSERT INTO academic_mentorships (student_user_id, proctor_user_id, is_active)
SELECT ps.user_id, mentor.user_id, true
FROM me_students ps
JOIN mentor_map mm ON mm.semester_num = ps.current_semester
JOIN users mentor ON lower(mentor.official_email) = lower(mm.mentor_email)
ON CONFLICT (student_user_id) DO UPDATE SET
  proctor_user_id = EXCLUDED.proctor_user_id,
  is_active = true,
  updated_at = NOW();

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'academics.me_timetable',
  'Student / Faculty / HOD',
  'anshuman.2549873@mygyanvihar.com',
  'B.Tech ME timetable & workload',
  'B.Tech ME Sem III/V/VII Batch A — 6 students, faculty Amit/Himanshu/Raj, HOD Neeraj',
  'Source: B.Tech (ME) Updated Time Table.pdf + faculty individual TT'
)
ON CONFLICT (smoke_key) DO UPDATE SET
  sample_record = EXCLUDED.sample_record,
  notes = EXCLUDED.notes,
  seeded_at = NOW();
"""

    OUT.write_text(sql, encoding="utf-8")
    print(f"Wrote migration to {OUT}")


def course_faculty(catalog: dict, code: str) -> str:
    return catalog.get(code, {}).get("faculty", "HOD")


if __name__ == "__main__":
    main()

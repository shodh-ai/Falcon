#!/usr/bin/env python3
"""Generate pharmacy timetable/workload SQL migration from pharmacy-seed-data.json."""

from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).resolve().parent / "pharmacy-seed-data.json"
OUT = Path(__file__).resolve().parents[1] / "migrations" / "20260709120000_pharmacy_timetable_workload_seed.sql"


def sql_str(value: str) -> str:
    return value.replace("'", "''")


def main() -> None:
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    faculty = payload["faculty"]
    program = payload["program_name"]
    year = payload["academic_year"]

    subjects: dict[str, dict] = {}
    allocations: list[tuple] = []
    slots: list[tuple] = []

    for sem, block in payload["semesters"].items():
        room = block["room"]
        for course in block["courses"]:
            subjects[course["code"]] = course
            email = faculty[course["faculty"]]
            allocations.append((course["code"], program, sem, email))
        for slot in block["slots"]:
            email = faculty[slot["faculty"]]
            slots.append((slot["course"], sem, room, slot["day"], slot["start"], slot["end"], email))

    subject_values = []
    for code, course in sorted(subjects.items()):
        short = code[:8]
        subject_values.append(
            f"  ('{sql_str(code)}', '{sql_str(course['name'])}', '{sql_str(short)}', "
            f"{course['credits']}, '{course['type']}')"
        )

    alloc_values = []
    for code, prog, sem, email in allocations:
        alloc_values.append(f"  ('{sql_str(code)}', '{sql_str(prog)}', '{sem}', '{sql_str(email)}')")

    slot_values = []
    for code, sem, room, day, start, end, email in slots:
        slot_values.append(
            f"  ('{sql_str(code)}', '{sem}', '{sql_str(room)}', {day}, '{start}'::time, '{end}'::time, '{sql_str(email)}')"
        )

    student_updates = []
    for student in payload["students"]:
        student_updates.append(
            f"  ('{sql_str(student['email'].lower())}', {student['semester']})"
        )

    mentorship_values = []
    for sem_num, mentor_key in payload["mentorship_by_semester"].items():
        mentorship_values.append(
            f"  ({sem_num}, '{sql_str(faculty[mentor_key])}')"
        )

    sql = f"""-- Pharmacy B.Pharm timetable + workload seed (Sem III / V / VII)
-- Source: pharmacy_TT.pdf + Pharmacy_Faculty_Workload_JULY -DEC. 2026.xlsx
-- Faculty scope: Manish Gupta, Mahendra Saini, Amit Kaushik (+ HOD hierarchy for Hitesh)

-- ---------------------------------------------------------------------------
-- 1. HOD hierarchy
-- ---------------------------------------------------------------------------
UPDATE departments d
SET hod_user_id = u.user_id, updated_at = NOW()
FROM users u
WHERE d.dept_name = 'Pharmacy'
  AND lower(u.official_email) = 'hitesh.kumar@mygyanvihar.com';

UPDATE users u
SET reporting_officer_id = hod.user_id, updated_at = NOW()
FROM users hod
WHERE lower(hod.official_email) = 'hitesh.kumar@mygyanvihar.com'
  AND lower(u.official_email) IN (
    'manish1.gupta@mygyanvihar.com',
    'mahendra.saini@mygyanvihar.com',
    'amit.kaushik@mygyanvihar.com'
  );

-- ---------------------------------------------------------------------------
-- 2. Pharmacy student profiles (semester + batch)
-- ---------------------------------------------------------------------------
UPDATE student_profiles sp
SET
  current_semester = v.sem,
  batch = 'B.Pharm',
  section_code = NULL,
  updated_at = NOW()
FROM users u
JOIN (VALUES
{',\n'.join(student_updates)}
) AS v(email, sem) ON lower(u.official_email) = lower(v.email)
JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = 'Pharmacy'
WHERE sp.user_id = u.user_id;

-- ---------------------------------------------------------------------------
-- 3. B.Pharm program + subjects + courses
-- ---------------------------------------------------------------------------
INSERT INTO iam_programs (program_name, program_code, duration_years)
SELECT 'B.Pharm', 'BPHARM', 4
WHERE NOT EXISTS (
  SELECT 1 FROM iam_programs WHERE upper(program_code) = 'BPHARM' AND deleted_at IS NULL
);

WITH prog AS (
  SELECT program_id FROM iam_programs
  WHERE upper(program_code) = 'BPHARM' AND deleted_at IS NULL
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
  SELECT subject_id, subject_code, subject_name, credits
  FROM academic_subjects
  WHERE subject_code IN ({', '.join(f"'{sql_str(c)}'" for c in sorted(subjects))})
)
INSERT INTO academic_courses (tenant_id, course_code, course_name, credits, is_elective, course_type)
SELECT
  t.tenant_id,
  s.subject_code,
  s.subject_name,
  s.credits,
  false,
  CASE WHEN s.subject_code LIKE '%P' THEN 'LAB' ELSE 'CORE' END
FROM tenant t
CROSS JOIN subject_rows s
ON CONFLICT (tenant_id, course_code) DO UPDATE SET
  course_name = EXCLUDED.course_name,
  credits = EXCLUDED.credits,
  course_type = EXCLUDED.course_type;

-- ---------------------------------------------------------------------------
-- 4. Course allocations (Manish / Mahendra / Amit only)
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
-- 5. Timetable slots from pharmacy_TT.pdf
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
  ) AS s(course_code, semester, room, day_of_week, start_time, end_time, faculty_email)
)
INSERT INTO academic_timetables (tenant_id, course_id, day_of_week, start_time, end_time, room, faculty_user_id)
SELECT
  t.tenant_id,
  c.course_id,
  s.day_of_week,
  s.start_time,
  s.end_time,
  s.room,
  u.user_id
FROM slot_rows s
JOIN course_rows c ON c.course_code = s.course_code
JOIN users u ON lower(u.official_email) = lower(s.faculty_email)
CROSS JOIN tenant t
ON CONFLICT (tenant_id, course_id, day_of_week, start_time, end_time)
WHERE deleted_at IS NULL
DO UPDATE SET
  room = EXCLUDED.room,
  faculty_user_id = EXCLUDED.faculty_user_id;

-- ---------------------------------------------------------------------------
-- 6. Student course enrollments (Pharmacy sem 3/5/7 only)
-- ---------------------------------------------------------------------------
WITH pharmacy_students AS (
  SELECT u.user_id, sp.tenant_id, sp.current_semester, sp.section_code, sp.batch
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = 'Pharmacy'
  WHERE sp.current_semester IN (3, 5, 7)
    AND sp.batch = 'B.Pharm'
),
matching_allocations AS (
  SELECT
    s.user_id,
    s.tenant_id,
    s.current_semester,
    s.section_code,
    a.course_id
  FROM pharmacy_students s
  JOIN academic_course_allocations a ON a.tenant_id = s.tenant_id
  WHERE a.academic_year = '{year}'
    AND a.status = 'ACTIVE'
    AND a.course_id IS NOT NULL
    AND upper(replace(COALESCE(a.program_name, ''), ' ', '')) = upper(replace(COALESCE(s.batch, 'B.Pharm'), ' ', ''))
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
-- 7. Faculty mentorships (one mentor per semester cohort)
-- ---------------------------------------------------------------------------
WITH mentor_map AS (
  SELECT * FROM (VALUES
{',\n'.join(mentorship_values)}
  ) AS m(semester_num, mentor_email)
),
pharmacy_students AS (
  SELECT u.user_id, sp.current_semester
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = 'Pharmacy'
  WHERE sp.batch = 'B.Pharm' AND sp.current_semester IN (3, 5, 7)
)
INSERT INTO academic_mentorships (student_user_id, proctor_user_id, is_active)
SELECT ps.user_id, mentor.user_id, true
FROM pharmacy_students ps
JOIN mentor_map mm ON mm.semester_num = ps.current_semester
JOIN users mentor ON lower(mentor.official_email) = lower(mm.mentor_email)
ON CONFLICT (student_user_id) DO UPDATE SET
  proctor_user_id = EXCLUDED.proctor_user_id,
  is_active = true,
  updated_at = NOW();

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'academics.pharmacy_timetable',
  'Student / Faculty / HOD',
  'lakshya.2548727@mygyanvihar.com',
  'Pharmacy timetable & workload',
  'B.Pharm Sem III/V/VII — 17 students, 3 faculty, HOD Hitesh',
  'Source: pharmacy_TT.pdf + Pharmacy_Faculty_Workload_JULY -DEC. 2026.xlsx'
)
ON CONFLICT (smoke_key) DO UPDATE SET
  sample_record = EXCLUDED.sample_record,
  notes = EXCLUDED.notes,
  seeded_at = NOW();
"""

    OUT.write_text(sql, encoding="utf-8")
    print(f"Wrote migration to {OUT}")


if __name__ == "__main__":
    main()

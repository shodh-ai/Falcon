#!/usr/bin/env python3
"""Generate Civil timetable + workload SQL migration from civil-seed-data.json."""

from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).resolve().parent / "civil-seed-data.json"
OUT = Path(__file__).resolve().parents[1] / "migrations" / "20260711120000_civil_timetable_workload_seed.sql"


def sql_str(value: str) -> str:
    return value.replace("'", "''")


def faculty_email(payload: dict, key: str | None) -> str | None:
    if not key:
        return None
    return payload["faculty"][key]


def sql_nullable_email(email: str | None) -> str:
    if email is None:
        return "NULL"
    return f"'{sql_str(email)}'"


def main() -> None:
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    faculty = payload["faculty"]
    program = payload["program_name"]
    dept = payload["dept_name"]
    year = payload["academic_year"]

    subjects: dict[str, dict] = {}
    allocations: list[tuple] = []
    slots: list[tuple] = []

    for sem, block in payload["semesters"].items():
        default_room = block["room"]
        for course in block["courses"]:
            subjects[course["code"]] = course
            email = faculty_email(payload, course.get("faculty"))
            allocations.append((course["code"], program, sem, email))
        for slot in block["slots"]:
            email = faculty_email(payload, slot.get("faculty"))
            room = slot.get("room") or default_room
            slots.append(
                (slot["course"], sem, room, slot["day"], slot["start"], slot["end"], email)
            )

    subject_values = []
    for code, course in sorted(subjects.items()):
        short = code[:8]
        subject_values.append(
            f"  ('{sql_str(code)}', '{sql_str(course['name'])}', '{sql_str(short)}', "
            f"{course['credits']}, '{course['type']}')"
        )

    alloc_values = [
        f"  ('{sql_str(c)}', '{sql_str(program)}', '{sem}', {sql_nullable_email(e)})"
        for c, program, sem, e in allocations
    ]
    slot_values = [
        f"  ('{sql_str(c)}', '{sem}', '{sql_str(room)}', {day}, '{start}'::time, '{end}'::time, {sql_nullable_email(e)})"
        for c, sem, room, day, start, end, e in slots
    ]
    student_updates = [
        f"  ('{sql_str(s['email'].lower())}', {s['semester']})"
        for s in payload["students"]
    ]
    mentorship_values = [
        f"  ({sem_num}, '{sql_str(faculty[mentor_key])}')"
        for sem_num, mentor_key in payload["mentorship_by_semester"].items()
    ]

    subject_codes_sql = ", ".join(f"'{sql_str(c)}'" for c in sorted(subjects))

    sql = f"""-- B.Tech CE timetable + workload seed (Sem III / V / VII)
-- Source: civil_TT.pdf + jagriti/nagendra/pradeep/ravindra faculty TT PDFs
-- Faculty scope: Ravindra (HOD), Jagriti, Pradeep, Nagendra only (plan-1 accurate mapping)

-- ---------------------------------------------------------------------------
-- 1. HOD hierarchy
-- ---------------------------------------------------------------------------
UPDATE departments d
SET hod_user_id = u.user_id, updated_at = NOW()
FROM users u
WHERE d.dept_name = '{sql_str(dept)}'
  AND lower(u.official_email) = 'ravindra.budania@mygyanvihar.com';

UPDATE users u
SET reporting_officer_id = hod.user_id, updated_at = NOW()
FROM users hod
WHERE lower(hod.official_email) = 'ravindra.budania@mygyanvihar.com'
  AND lower(u.official_email) IN (
    'jagriti.gupta@mygyanvihar.com',
    'pradeepkr.shrivastava@mygyanvihar.com',
    'nagendra.dhakar@mygyanvihar.com'
  );

-- ---------------------------------------------------------------------------
-- 2. Civil student profiles (semester + batch)
-- ---------------------------------------------------------------------------
UPDATE student_profiles sp
SET
  current_semester = v.sem,
  batch = '{sql_str(program)}',
  section_code = NULL,
  updated_at = NOW()
FROM users u
JOIN (VALUES
{',\n'.join(student_updates)}
) AS v(email, sem) ON lower(u.official_email) = lower(v.email)
JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = '{sql_str(dept)}'
WHERE sp.user_id = u.user_id;

-- ---------------------------------------------------------------------------
-- 3. B.Tech CE program + subjects + courses
-- ---------------------------------------------------------------------------
INSERT INTO iam_programs (program_name, program_code, duration_years)
SELECT '{sql_str(program)}', 'BTECH-CE', 4
WHERE NOT EXISTS (
  SELECT 1 FROM iam_programs WHERE upper(program_code) = 'BTECH-CE' AND deleted_at IS NULL
);

WITH prog AS (
  SELECT program_id FROM iam_programs
  WHERE upper(program_code) = 'BTECH-CE' AND deleted_at IS NULL
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
  WHERE subject_code IN ({subject_codes_sql})
)
INSERT INTO academic_courses (tenant_id, course_code, course_name, credits, is_elective, course_type)
SELECT
  t.tenant_id,
  s.subject_code,
  s.subject_name,
  s.credits,
  false,
  CASE WHEN s.subject_code LIKE '%P' OR s.subject_code LIKE '%LAB' THEN 'LAB' ELSE 'CORE' END
FROM tenant t
CROSS JOIN subject_rows s
ON CONFLICT (tenant_id, course_code) DO UPDATE SET
  course_name = EXCLUDED.course_name,
  credits = EXCLUDED.credits,
  course_type = EXCLUDED.course_type;

-- ---------------------------------------------------------------------------
-- 4. Course allocations (nullable faculty for outsider-taught subjects)
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
LEFT JOIN users u ON a.faculty_email IS NOT NULL AND lower(u.official_email) = lower(a.faculty_email)
CROSS JOIN tenant t
ON CONFLICT (tenant_id, subject_id, program_name, semester, academic_year) DO UPDATE SET
  faculty_user_id = EXCLUDED.faculty_user_id,
  course_id = EXCLUDED.course_id,
  status = 'ACTIVE',
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 5. Timetable slots
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
LEFT JOIN users u ON s.faculty_email IS NOT NULL AND lower(u.official_email) = lower(s.faculty_email)
CROSS JOIN tenant t
ON CONFLICT (tenant_id, course_id, day_of_week, start_time, end_time)
WHERE deleted_at IS NULL
DO UPDATE SET
  room = EXCLUDED.room,
  faculty_user_id = EXCLUDED.faculty_user_id;

-- ---------------------------------------------------------------------------
-- 6. Student enrollments
-- ---------------------------------------------------------------------------
WITH civil_students AS (
  SELECT u.user_id, sp.tenant_id, sp.current_semester, sp.section_code, sp.batch
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = '{sql_str(dept)}'
  WHERE sp.current_semester IN (3, 5, 7)
    AND sp.batch = '{sql_str(program)}'
),
matching_allocations AS (
  SELECT
    s.user_id,
    s.tenant_id,
    s.current_semester,
    s.section_code,
    a.course_id
  FROM civil_students s
  JOIN academic_course_allocations a ON a.tenant_id = s.tenant_id
  WHERE a.academic_year = '{year}'
    AND a.status = 'ACTIVE'
    AND a.course_id IS NOT NULL
    AND upper(replace(COALESCE(a.program_name, ''), ' ', '')) = upper(replace(COALESCE(s.batch, '{sql_str(program)}'), ' ', ''))
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
-- 7. Mentorships (sem 5 → Jagriti, sem 7 → Pradeep; sem 3 PT has no login)
-- ---------------------------------------------------------------------------
WITH mentor_map AS (
  SELECT * FROM (VALUES
{',\n'.join(mentorship_values)}
  ) AS m(semester_num, mentor_email)
),
civil_students AS (
  SELECT u.user_id, sp.current_semester
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = '{sql_str(dept)}'
  WHERE sp.batch = '{sql_str(program)}' AND sp.current_semester IN (5, 7)
)
INSERT INTO academic_mentorships (student_user_id, proctor_user_id, is_active)
SELECT ps.user_id, mentor.user_id, true
FROM civil_students ps
JOIN mentor_map mm ON mm.semester_num = ps.current_semester
JOIN users mentor ON lower(mentor.official_email) = lower(mm.mentor_email)
ON CONFLICT (student_user_id) DO UPDATE SET
  proctor_user_id = EXCLUDED.proctor_user_id,
  is_active = true,
  updated_at = NOW();

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'academics.civil_timetable',
  'Student / Faculty / HOD',
  'roop.2548471@mygyanvihar.com',
  'Civil timetable & workload',
  'B.Tech CE Sem III/V/VII — 7 students, HOD Ravindra, faculty Jagriti/Pradeep/Nagendra',
  'Source: civil_TT.pdf + faculty TT PDFs (plan-1 accurate faculty mapping)'
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

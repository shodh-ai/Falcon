#!/usr/bin/env python3
"""Generate BPT physiotherapy timetable/workload SQL migration from physio-seed-data.json."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

DATA = Path(__file__).resolve().parent / "physio-seed-data.json"
OUT = Path(__file__).resolve().parents[1] / "migrations" / "20260713120000_physio_timetable_workload_seed.sql"

PWD_HASH = "$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO"


def sql_str(value: str) -> str:
    return value.replace("'", "''")


def user_uuid(email: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, email.strip().lower()))


def main() -> None:
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    faculty = payload["faculty"]
    program = payload["program_name"]
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
        seen_alloc: set[tuple] = set()
        for course in block["courses"]:
            key = (course["code"], program, sem_label)
            if key in seen_alloc:
                continue
            seen_alloc.add(key)
            email = faculty.get(course["faculty"], faculty["HOD"])
            allocations.append((course["code"], program, sem_label, email))
        for slot in block["slots"]:
            email = faculty.get(slot["faculty"], faculty["HOD"])
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
        sem = slot["semester"]
        sem_label = f"{sem}-A"
        faculty_slots.append(
            (
                slot["course"],
                sem_label,
                slot.get("room", "BPT-LT-1"),
                slot["day"],
                slot["start"],
                slot["end"],
                email,
                "A",
            )
        )

    subject_values = []
    for code, course in sorted(catalog.items()):
        short = code[:8]
        subject_values.append(
            f"  ('{sql_str(code)}', '{sql_str(course['name'])}', '{sql_str(short)}', "
            f"{course['credits']}, '{course['type']}')"
        )

    alloc_values = []
    for code, prog, sem, email in allocations:
        alloc_values.append(
            f"  ('{sql_str(code)}', '{sql_str(prog)}', '{sem}', '{sql_str(email)}')"
        )

    # VII sem faculty-only courses from catalog
    vii_codes = {c["code"] for c in catalog.values() if c.get("semester") == "VII"}
    for code in sorted(vii_codes):
        course = catalog[code]
        if any(a[0] == code for a in allocations):
            continue
        email = faculty.get(course["faculty"], faculty["HOD"])
        alloc_values.append(
            f"  ('{sql_str(code)}', '{sql_str(program)}', 'VII-A', '{sql_str(email)}')"
        )

    def slot_lines(slots: list[tuple]) -> list[str]:
        lines = []
        for code, sem, room, day, start, end, email, section in slots:
            lines.append(
                f"  ('{sql_str(code)}', '{sem}', '{sql_str(room)}', '{section}', {day}, "
                f"'{start}'::time, '{end}'::time, '{sql_str(email)}')"
            )
        return lines

    slot_values = slot_lines(batch_slots + faculty_slots)

    student_rows = []
    for student in payload["student_users_to_ensure"]:
        student_rows.append(
            f"  ('{user_uuid(student['email'])}'::uuid, '{sql_str(student['name'])}', "
            f"'{sql_str(student['email'].lower())}', {student['semester']}, "
            f"'{sql_str(student.get('section', 'A'))}')"
        )

    mentorship_values = []
    for sem_num, mentor_key in payload["mentorship_by_semester"].items():
        mentorship_values.append(
            f"  ({sem_num}, '{sql_str(faculty[mentor_key])}')"
        )

    faculty_emails = sorted(
        {
            faculty["RG"],
            faculty["PB"],
            faculty["AS"],
            payload["hod_email"],
        }
    )

    sql = f"""-- BPT Physiotherapy timetable + workload seed (Sem III / V Batch A)
-- Source: PHYSIOTHERAPY DEPT DATA new.xlsx (batch A + faculty sheets RG/PB/AS)
-- Faculty scope: Riya Gupta, Prachi Baheti, Ajit Surana (+ HOD Gaurav Agarwal)

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
    '{sql_str(faculty["RG"])}',
    '{sql_str(faculty["PB"])}',
    '{sql_str(faculty["AS"])}'
  );

-- ---------------------------------------------------------------------------
-- 2. Ensure Batch A students exist (Excel emails)
-- ---------------------------------------------------------------------------
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
dept AS (
  SELECT dept_id FROM departments WHERE dept_name = '{sql_str(dept)}' LIMIT 1
),
pwd AS (
  SELECT '{PWD_HASH}'::varchar AS hash
),
seed_students AS (
  SELECT * FROM (VALUES
{',\n'.join(student_rows)}
  ) AS s(user_id, name, email, semester_num, section_code)
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, is_active, onboarding_status, onboarding_profile
)
SELECT
  s.user_id, t.tenant_id, s.name, s.email, r.role_id, d.dept_id,
  p.hash, true, 'ACTIVE', '{{}}'::jsonb
FROM seed_students s
CROSS JOIN tenant t
CROSS JOIN pwd p
CROSS JOIN dept d
JOIN roles r ON r.role_name = 'Student'
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  dept_id = EXCLUDED.dept_id,
  is_active = true,
  onboarding_status = 'ACTIVE';

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u
WHERE lower(u.official_email) IN (
  SELECT lower(email) FROM (VALUES
{',\n'.join(f"  ('{sql_str(s['email'].lower())}')" for s in payload['student_users_to_ensure'])}
  ) AS v(email)
)
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

WITH seed_students AS (
  SELECT * FROM (VALUES
{',\n'.join(student_rows)}
  ) AS s(user_id, name, email, semester_num, section_code)
)
INSERT INTO student_profiles (
  tenant_id, user_id, enrollment_no, enrollment_number, admission_number,
  current_semester, batch, section_code, admission_status, status
)
SELECT
  u.tenant_id,
  u.user_id,
  split_part(u.official_email, '@', 1),
  split_part(u.official_email, '@', 1),
  split_part(u.official_email, '@', 1),
  s.semester_num,
  'BPT',
  s.section_code,
  'ACTIVE',
  'ACTIVE'
FROM seed_students s
JOIN users u ON u.user_id = s.user_id
ON CONFLICT (user_id) DO UPDATE SET
  current_semester = EXCLUDED.current_semester,
  batch = 'BPT',
  section_code = EXCLUDED.section_code,
  updated_at = NOW();

-- Also align existing BPT students used for Batch A cohort
UPDATE student_profiles sp
SET
  current_semester = v.sem,
  batch = 'BPT',
  section_code = v.section_code,
  updated_at = NOW()
FROM users u
JOIN (VALUES
{',\n'.join(f"  ('{sql_str(s['email'].lower())}', {s['semester']}, '{sql_str(s.get('section', 'A'))}')" for s in payload['students'])}
) AS v(email, sem, section_code) ON lower(u.official_email) = lower(v.email)
JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = '{sql_str(dept)}'
WHERE sp.user_id = u.user_id;

-- ---------------------------------------------------------------------------
-- 3. BPT program + subjects + courses
-- ---------------------------------------------------------------------------
INSERT INTO iam_programs (program_name, program_code, duration_years)
SELECT 'BPT', 'BPT', 4
WHERE NOT EXISTS (
  SELECT 1 FROM iam_programs WHERE upper(program_code) = 'BPT' AND deleted_at IS NULL
);

WITH prog AS (
  SELECT program_id FROM iam_programs
  WHERE upper(program_code) = 'BPT' AND deleted_at IS NULL
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
-- 5. Timetable slots (batch A + faculty RG/PB/AS sheets)
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
-- 6. Student course enrollments (BPT sem 3/5 Batch A)
-- ---------------------------------------------------------------------------
WITH bpt_students AS (
  SELECT u.user_id, sp.tenant_id, sp.current_semester, sp.section_code, sp.batch
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = '{sql_str(dept)}'
  WHERE sp.current_semester IN (3, 5)
    AND sp.batch = 'BPT'
    AND sp.section_code = 'A'
),
matching_allocations AS (
  SELECT
    s.user_id,
    s.tenant_id,
    s.current_semester,
    s.section_code,
    a.course_id
  FROM bpt_students s
  JOIN academic_course_allocations a ON a.tenant_id = s.tenant_id
  WHERE a.academic_year = '{year}'
    AND a.status = 'ACTIVE'
    AND a.course_id IS NOT NULL
    AND upper(replace(COALESCE(a.program_name, ''), ' ', '')) = 'BPT'
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
-- 7. Faculty mentorships (Riya for sem 3 & 5 Batch A)
-- ---------------------------------------------------------------------------
WITH mentor_map AS (
  SELECT * FROM (VALUES
{',\n'.join(mentorship_values)}
  ) AS m(semester_num, mentor_email)
),
bpt_students AS (
  SELECT u.user_id, sp.current_semester
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = '{sql_str(dept)}'
  WHERE sp.batch = 'BPT' AND sp.current_semester IN (3, 5) AND sp.section_code = 'A'
)
INSERT INTO academic_mentorships (student_user_id, proctor_user_id, is_active)
SELECT ps.user_id, mentor.user_id, true
FROM bpt_students ps
JOIN mentor_map mm ON mm.semester_num = ps.current_semester
JOIN users mentor ON lower(mentor.official_email) = lower(mm.mentor_email)
ON CONFLICT (student_user_id) DO UPDATE SET
  proctor_user_id = EXCLUDED.proctor_user_id,
  is_active = true,
  updated_at = NOW();

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'academics.physio_timetable',
  'Student / Faculty / HOD',
  'akansha.2550136@mygyanvihar.com',
  'BPT timetable & workload',
  'BPT Sem III/V Batch A — 10 students, faculty Riya/Prachi/Ajit, HOD Gaurav',
  'Source: PHYSIOTHERAPY DEPT DATA new.xlsx'
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

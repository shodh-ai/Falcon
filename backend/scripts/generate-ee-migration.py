#!/usr/bin/env python3
"""Generate EE timetable + credential SQL migration from ee-seed-data.json."""

from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).resolve().parent / "ee-seed-data.json"
OUT = Path(__file__).resolve().parents[1] / "migrations" / "20260710130000_ee_timetable_workload_seed.sql"

# Stable UUIDs for EE personas (raj reuses existing school seed id)
CRED_UUID = {
    "paresh.jain@mygyanvihar.com": "a1000001-0000-4000-8000-000000000001",
    "ritu.jain@mygyanvihar.com": "a1000002-0000-4000-8000-000000000002",
    "raj.kumar@mygyanvihar.com": "495fd9ec-fe91-5dbd-8576-7d823488daa4",
    "prince.2547711@mygyanvihar.com": "a1000101-0000-4000-8000-000000000011",
    "arbaz.2550453@mygyanvihar.com": "a1000102-0000-4000-8000-000000000012",
    "aditya21mailme@gmail.com": "a1000103-0000-4000-8000-000000000013",
    "kumaranikit424@gmail.com": "a1000104-0000-4000-8000-000000000014",
    "kumardhiraj944229@gmail.com": "a1000105-0000-4000-8000-000000000015",
    "krishsharma0623@gmail.com": "a1000106-0000-4000-8000-000000000016",
    "kundanku8544@gmail.com": "a1000107-0000-4000-8000-000000000017",
}

ENROLLMENT = {
    "prince.2547711@mygyanvihar.com": "2547711",
    "arbaz.2550453@mygyanvihar.com": "2550453",
    "aditya21mailme@gmail.com": "EE5001",
    "kumaranikit424@gmail.com": "EE5002",
    "kumardhiraj944229@gmail.com": "EE5003",
    "krishsharma0623@gmail.com": "EE5004",
    "kundanku8544@gmail.com": "EE5005",
}


def sql_str(value: str) -> str:
    return value.replace("'", "''")


def main() -> None:
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    faculty = payload["faculty"]
    program = payload["program_name"]
    year = payload["academic_year"]

    staff_values = []
    student_values = []
    for cred in payload["credentials"]:
        email = cred["email"].lower().strip()
        uid = CRED_UUID[email]
        if cred["role"] in ("HOD", "Faculty"):
            staff_values.append(
                f"  ('{uid}'::uuid, '{sql_str(cred['name'])}', '{sql_str(email)}', "
                f"'Electrical Engg', '{cred['role']}')"
            )
        else:
            student_values.append(
                f"  ('{uid}'::uuid, '{sql_str(cred['name'])}', '{sql_str(email)}', "
                f"'Electrical Engg', 'Student', '{sql_str(ENROLLMENT.get(email, email.split('@')[0]))}', {cred['semester']})"
            )

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

    alloc_values = [
        f"  ('{sql_str(c)}', '{sql_str(program)}', '{sem}', '{sql_str(e)}')"
        for c, program, sem, e in allocations
    ]
    slot_values = [
        f"  ('{sql_str(c)}', '{sem}', '{sql_str(room)}', {day}, '{start}'::time, '{end}'::time, '{sql_str(e)}')"
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

    all_uuids = ",\n  ".join(f"'{u}'::uuid" for u in CRED_UUID.values())

    sql = f"""-- B.Tech EE timetable + workload seed (Sem III / V)
-- Source: EE_Ids.xlsx + EE (3 and 5 sem) TIME TABLE 2026.xlsx + EE_Faculty Time Table 2026.xlsx

-- ---------------------------------------------------------------------------
-- 1. Credentials (EE_Ids.xlsx) — password123
-- ---------------------------------------------------------------------------
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
seed_staff AS (
  SELECT * FROM (VALUES
{',\n'.join(staff_values)}
  ) AS s(user_id, name, email, dept_name, role_name)
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, is_active, onboarding_status, onboarding_profile
)
SELECT
  s.user_id, t.tenant_id, s.name, s.email, r.role_id, d.dept_id,
  p.hash, true, 'PENDING_PASSWORD_RESET', '{{}}'::jsonb
FROM seed_staff s
CROSS JOIN tenant t
CROSS JOIN pwd p
JOIN departments d ON d.dept_name = s.dept_name
JOIN roles r ON r.role_name = s.role_name
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  dept_id = EXCLUDED.dept_id,
  password_hash = EXCLUDED.password_hash,
  is_active = true,
  onboarding_status = 'PENDING_PASSWORD_RESET';

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u
WHERE lower(u.official_email) IN (
  'paresh.jain@mygyanvihar.com',
  'ritu.jain@mygyanvihar.com',
  'raj.kumar@mygyanvihar.com'
)
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
seed_students AS (
  SELECT * FROM (VALUES
{',\n'.join(student_values)}
  ) AS s(user_id, name, email, dept_name, role_name, enrollment_no, semester_num)
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, is_active, onboarding_status, onboarding_profile
)
SELECT
  s.user_id, t.tenant_id, s.name, s.email, r.role_id, d.dept_id,
  p.hash, true, 'PENDING_PASSWORD_RESET', '{{}}'::jsonb
FROM seed_students s
CROSS JOIN tenant t
CROSS JOIN pwd p
JOIN departments d ON d.dept_name = s.dept_name
JOIN roles r ON r.role_name = s.role_name
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  dept_id = EXCLUDED.dept_id,
  password_hash = EXCLUDED.password_hash,
  is_active = true;

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u
WHERE u.user_id IN (
  {all_uuids}
)
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

WITH seed_students AS (
  SELECT * FROM (VALUES
{',\n'.join(student_values)}
  ) AS s(user_id, name, email, dept_name, role_name, enrollment_no, semester_num)
)
INSERT INTO student_profiles (
  tenant_id, user_id, enrollment_no, enrollment_number, admission_number,
  current_semester, batch, section_code, nationality, admission_status, status
)
SELECT
  u.tenant_id, u.user_id, s.enrollment_no, s.enrollment_no, s.enrollment_no,
  s.semester_num, 'B.Tech EE', NULL, 'Indian', 'ACTIVE', 'ACTIVE'
FROM seed_students s
JOIN users u ON lower(u.official_email) = lower(s.email)
ON CONFLICT (user_id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  enrollment_no = EXCLUDED.enrollment_no,
  enrollment_number = EXCLUDED.enrollment_number,
  admission_number = EXCLUDED.admission_number,
  current_semester = EXCLUDED.current_semester,
  batch = EXCLUDED.batch,
  section_code = EXCLUDED.section_code,
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 2. HOD hierarchy
-- ---------------------------------------------------------------------------
UPDATE departments d
SET hod_user_id = u.user_id, updated_at = NOW()
FROM users u
WHERE d.dept_name = 'Electrical Engg'
  AND lower(u.official_email) = 'paresh.jain@mygyanvihar.com';

UPDATE users u
SET reporting_officer_id = hod.user_id, updated_at = NOW()
FROM users hod
WHERE lower(hod.official_email) = 'paresh.jain@mygyanvihar.com'
  AND lower(u.official_email) IN (
    'ritu.jain@mygyanvihar.com',
    'raj.kumar@mygyanvihar.com'
  );

UPDATE student_profiles sp
SET
  current_semester = v.sem,
  batch = 'B.Tech EE',
  section_code = NULL,
  updated_at = NOW()
FROM users u
JOIN (VALUES
{',\n'.join(student_updates)}
) AS v(email, sem) ON lower(u.official_email) = lower(v.email)
JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = 'Electrical Engg'
WHERE sp.user_id = u.user_id;

-- ---------------------------------------------------------------------------
-- 3. B.Tech EE program + subjects + courses
-- ---------------------------------------------------------------------------
INSERT INTO iam_programs (program_name, program_code, duration_years)
SELECT 'B.Tech EE', 'BTECH-EE', 4
WHERE NOT EXISTS (
  SELECT 1 FROM iam_programs WHERE upper(program_code) = 'BTECH-EE' AND deleted_at IS NULL
);

WITH prog AS (
  SELECT program_id FROM iam_programs
  WHERE upper(program_code) = 'BTECH-EE' AND deleted_at IS NULL
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
-- 4. Course allocations (Ritu + Raj)
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
JOIN users u ON lower(u.official_email) = lower(s.faculty_email)
CROSS JOIN tenant t
ON CONFLICT (tenant_id, course_id, day_of_week, start_time, end_time)
WHERE deleted_at IS NULL
DO UPDATE SET
  room = EXCLUDED.room,
  faculty_user_id = EXCLUDED.faculty_user_id;

-- ---------------------------------------------------------------------------
-- 6. Student enrollments
-- ---------------------------------------------------------------------------
WITH ee_students AS (
  SELECT u.user_id, sp.tenant_id, sp.current_semester, sp.section_code, sp.batch
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = 'Electrical Engg'
  WHERE sp.current_semester IN (3, 5)
    AND sp.batch = 'B.Tech EE'
),
matching_allocations AS (
  SELECT
    s.user_id,
    s.tenant_id,
    s.current_semester,
    s.section_code,
    a.course_id
  FROM ee_students s
  JOIN academic_course_allocations a ON a.tenant_id = s.tenant_id
  WHERE a.academic_year = '{year}'
    AND a.status = 'ACTIVE'
    AND a.course_id IS NOT NULL
    AND upper(replace(COALESCE(a.program_name, ''), ' ', '')) = upper(replace(COALESCE(s.batch, 'B.Tech EE'), ' ', ''))
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
-- 7. Mentorships
-- ---------------------------------------------------------------------------
WITH mentor_map AS (
  SELECT * FROM (VALUES
{',\n'.join(mentorship_values)}
  ) AS m(semester_num, mentor_email)
),
ee_students AS (
  SELECT u.user_id, sp.current_semester
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = 'Electrical Engg'
  WHERE sp.batch = 'B.Tech EE' AND sp.current_semester IN (3, 5)
)
INSERT INTO academic_mentorships (student_user_id, proctor_user_id, is_active)
SELECT ps.user_id, mentor.user_id, true
FROM ee_students ps
JOIN mentor_map mm ON mm.semester_num = ps.current_semester
JOIN users mentor ON lower(mentor.official_email) = lower(mm.mentor_email)
ON CONFLICT (student_user_id) DO UPDATE SET
  proctor_user_id = EXCLUDED.proctor_user_id,
  is_active = true,
  updated_at = NOW();

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'academics.ee_timetable',
  'Student / Faculty / HOD',
  'prince.2547711@mygyanvihar.com',
  'EE timetable & workload',
  'B.Tech EE Sem III/V — 7 students, HOD Paresh, faculty Ritu/Raj',
  'Source: EE_Ids.xlsx + EE timetable workbooks'
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

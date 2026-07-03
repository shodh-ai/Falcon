-- Semester-section course mapping: full BTECH CSE III-A / III-B workload + student slot columns.
-- Source: Work load AESTR (1).pdf — 12 subjects per section for semester III.

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS current_semester INT,
  ADD COLUMN IF NOT EXISTS section_code VARCHAR(10);

-- ---------------------------------------------------------------------------
-- Additional faculty from workload sheet
-- ---------------------------------------------------------------------------
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
dept AS (
  SELECT dept_id FROM departments WHERE dept_name = 'Computer Science' LIMIT 1
),
hod AS (
  SELECT user_id FROM users WHERE official_email = 'hod@mygyanvihar.com' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
seed_faculty AS (
  SELECT * FROM (VALUES
    ('f3000007-0000-4000-8000-000000000007'::uuid, 'Bhanu Pratap',      'bhanu.pratap@mygyanvihar.com'),
    ('f3000008-0000-4000-8000-000000000008'::uuid, 'Sandhya Sharma',    'sandhya.sharma@mygyanvihar.com'),
    ('f3000009-0000-4000-8000-000000000009'::uuid, 'Himanshu Varshney', 'himanshu.varshney@mygyanvihar.com'),
    ('f3000010-0000-4000-8000-000000000010'::uuid, 'Nasreen Praveen',   'nasreen.praveen@mygyanvihar.com')
  ) AS f(user_id, name, email)
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, reporting_officer_id, is_active, onboarding_status, onboarding_profile
)
SELECT
  sf.user_id, t.tenant_id, sf.name, sf.email, r.role_id, d.dept_id,
  p.hash, hod.user_id, true, 'ACTIVE', '{}'::jsonb
FROM seed_faculty sf
CROSS JOIN tenant t
CROSS JOIN pwd p
CROSS JOIN dept d
LEFT JOIN hod ON true
JOIN roles r ON r.role_name = 'Faculty'
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  dept_id = EXCLUDED.dept_id,
  is_active = true,
  onboarding_status = 'ACTIVE';

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u
WHERE lower(u.official_email) IN (
  'bhanu.pratap@mygyanvihar.com',
  'sandhya.sharma@mygyanvihar.com',
  'himanshu.varshney@mygyanvihar.com',
  'nasreen.praveen@mygyanvihar.com'
)
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

-- ---------------------------------------------------------------------------
-- Semester III catalog (all 12 subjects per section)
-- ---------------------------------------------------------------------------
WITH prog AS (
  SELECT program_id FROM iam_programs WHERE deleted_at IS NULL ORDER BY program_id LIMIT 1
)
INSERT INTO academic_subjects (subject_code, subject_name, subject_shortname, program_id, credits, subject_type, is_active)
SELECT v.subject_code, v.subject_name, v.subject_shortname, p.program_id, v.credits, v.subject_type, true
FROM prog p
CROSS JOIN (VALUES
  ('SODECA-III', 'Social Outreach, Discipline & Extra Curriculum Activities -III', 'SODECA-III', 2, 'LAB'),
  ('UC3002',     'Economics & Social Sciences',                                   'ESS',        3, 'THEORY'),
  ('MA3004',     'Engineering Mathematics III',                                   'EM III',     3, 'THEORY'),
  ('EC3001',     'Digital Logic Design',                                          'DLD',        2, 'THEORY'),
  ('EC3002',     'Digital Logic Design Lab',                                      'DLD Lab',    1, 'LAB'),
  ('CS3052',     'Data Structures and Algorithms Lab',                            'DSA Lab',    1, 'LAB'),
  ('CS3004',     'Innovation Lab III',                                            'IL III',     2, 'LAB')
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
  WHERE subject_code IN (
    'SODECA-III', 'UC3002', 'EEPI', 'CS3001', 'CS3002', 'MA3004',
    'CS3101', 'EC3001', 'CS3052', 'CS3151', 'CS3004', 'EC3002'
  )
)
INSERT INTO academic_courses (tenant_id, course_code, course_name, credits, is_elective, course_type)
SELECT t.tenant_id, s.subject_code, s.subject_name, s.credits, false, 'CORE'
FROM tenant t
CROSS JOIN subject_rows s
ON CONFLICT (tenant_id, course_code) DO UPDATE SET
  course_name = EXCLUDED.course_name,
  credits = EXCLUDED.credits,
  course_type = 'CORE';

-- ---------------------------------------------------------------------------
-- Faculty allocations: BTECH CSE III-A and III-B (2026-2027)
-- ---------------------------------------------------------------------------
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
subject_rows AS (
  SELECT subject_id, subject_code FROM academic_subjects
  WHERE subject_code IN (
    'SODECA-III', 'UC3002', 'EEPI', 'CS3001', 'CS3002', 'MA3004',
    'CS3101', 'EC3001', 'CS3052', 'CS3151', 'CS3004', 'EC3002'
  )
),
course_rows AS (
  SELECT course_id, course_code FROM academic_courses
  WHERE course_code IN (
    'SODECA-III', 'UC3002', 'EEPI', 'CS3001', 'CS3002', 'MA3004',
    'CS3101', 'EC3001', 'CS3052', 'CS3151', 'CS3004', 'EC3002'
  )
),
allocations AS (
  SELECT * FROM (VALUES
    ('SODECA-III', 'BTECH CSE', 'III-A', 'naman.raj@mygyanvihar.com'),
    ('UC3002',     'BTECH CSE', 'III-A', 'bhanu.pratap@mygyanvihar.com'),
    ('EEPI',       'BTECH CSE', 'III-A', 'neha.ranga@mygyanvihar.com'),
    ('CS3001',     'BTECH CSE', 'III-A', 'samali.ghosh@mygyanvihar.com'),
    ('CS3002',     'BTECH CSE', 'III-A', 'priyanka1.gupta@mygyanvihar.com'),
    ('MA3004',     'BTECH CSE', 'III-A', NULL),
    ('CS3101',     'BTECH CSE', 'III-A', 'naman.raj@mygyanvihar.com'),
    ('EC3001',     'BTECH CSE', 'III-A', 'sandhya.sharma@mygyanvihar.com'),
    ('CS3052',     'BTECH CSE', 'III-A', 'samali.ghosh@mygyanvihar.com'),
    ('CS3151',     'BTECH CSE', 'III-A', 'naman.raj@mygyanvihar.com'),
    ('CS3004',     'BTECH CSE', 'III-A', 'himanshu.varshney@mygyanvihar.com'),
    ('EC3002',     'BTECH CSE', 'III-A', 'sandhya.sharma@mygyanvihar.com'),
    ('SODECA-III', 'BTECH CSE', 'III-B', 'neha.ranga@mygyanvihar.com'),
    ('UC3002',     'BTECH CSE', 'III-B', 'bhanu.pratap@mygyanvihar.com'),
    ('EEPI',       'BTECH CSE', 'III-B', 'neha.ranga@mygyanvihar.com'),
    ('CS3001',     'BTECH CSE', 'III-B', 'pooja.varshney@mygyanvihar.com'),
    ('CS3002',     'BTECH CSE', 'III-B', NULL),
    ('MA3004',     'BTECH CSE', 'III-B', NULL),
    ('CS3101',     'BTECH CSE', 'III-B', 'nasreen.praveen@mygyanvihar.com'),
    ('EC3001',     'BTECH CSE', 'III-B', 'sandhya.sharma@mygyanvihar.com'),
    ('CS3052',     'BTECH CSE', 'III-B', 'pooja.varshney@mygyanvihar.com'),
    ('CS3151',     'BTECH CSE', 'III-B', 'nasreen.praveen@mygyanvihar.com'),
    ('CS3004',     'BTECH CSE', 'III-B', 'himanshu.varshney@mygyanvihar.com'),
    ('EC3002',     'BTECH CSE', 'III-B', 'sandhya.sharma@mygyanvihar.com')
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
  '2026-2027',
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

INSERT INTO academic_timetables (tenant_id, course_id, day_of_week, start_time, end_time, faculty_user_id)
SELECT DISTINCT
  a.tenant_id,
  a.course_id,
  1,
  '09:00'::time,
  '10:00'::time,
  a.faculty_user_id
FROM academic_course_allocations a
WHERE a.academic_year = '2026-2027'
  AND a.faculty_user_id IS NOT NULL
  AND a.course_id IS NOT NULL
  AND a.semester IN ('III-A', 'III-B')
  AND NOT EXISTS (
    SELECT 1 FROM academic_timetables t
    WHERE t.tenant_id = a.tenant_id
      AND t.course_id = a.course_id
      AND t.faculty_user_id = a.faculty_user_id
  );

-- ---------------------------------------------------------------------------
-- Explicit student semester + section slots
-- ---------------------------------------------------------------------------
UPDATE student_profiles sp
SET
  current_semester = data.semester_num,
  section_code = data.section_code,
  updated_at = NOW()
FROM users u
JOIN (VALUES
  ('munmun.2549711@mygyanvihar.com',   3, 'A'),
  ('sakshi.2548515@mygyanvihar.com',   3, 'A'),
  ('prasoon.2548543@mygyanvihar.com',  3, 'A'),
  ('aniketsain45@gmail.com',           3, 'A'),
  ('sameerchoudhary@mygyanvihar.com',  3, 'A'),
  ('hardik.2347602@mygyanvihar.com',   5, 'A'),
  ('nasreen.2547973@mygyanvihar.com',  5, 'A'),
  ('rahul.2548184@mygyanvihar.com',    5, 'B'),
  ('sumit.23181508@mygyanvihar.com',   7, 'A'),
  ('samir.2347454@mygyanvihar.com',    7, 'A')
) AS data(email, semester_num, section_code) ON lower(u.official_email) = lower(data.email)
WHERE sp.user_id = u.user_id;

-- ---------------------------------------------------------------------------
-- Sync semester-3 enrollments to III-A allocation set (12 courses)
-- ---------------------------------------------------------------------------
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
sem3_students AS (
  SELECT u.user_id, sp.current_semester, sp.section_code
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  WHERE sp.current_semester = 3 AND sp.section_code = 'A'
),
iii_a_courses AS (
  SELECT DISTINCT a.course_id
  FROM academic_course_allocations a
  CROSS JOIN tenant t
  WHERE a.tenant_id = t.tenant_id
    AND a.academic_year = '2026-2027'
    AND a.program_name = 'BTECH CSE'
    AND a.semester = 'III-A'
    AND a.course_id IS NOT NULL
)
INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, section_code, status)
SELECT t.tenant_id, s.user_id, c.course_id, 3, 'A', 'ENROLLED'
FROM sem3_students s
CROSS JOIN iii_a_courses c
CROSS JOIN tenant t
ON CONFLICT (tenant_id, student_user_id, course_id) DO UPDATE SET
  semester = 3,
  section_code = 'A',
  status = CASE
    WHEN student_course_enrollments.status = 'COMPLETED' THEN student_course_enrollments.status
    ELSE 'ENROLLED'
  END;

-- Remove stale semester-3 ENROLLED rows that are not in III-A allocation set
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
sem3_students AS (
  SELECT u.user_id
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  WHERE sp.current_semester = 3 AND sp.section_code = 'A'
),
iii_a_courses AS (
  SELECT DISTINCT a.course_id
  FROM academic_course_allocations a
  CROSS JOIN tenant t
  WHERE a.tenant_id = t.tenant_id
    AND a.academic_year = '2026-2027'
    AND a.program_name = 'BTECH CSE'
    AND a.semester = 'III-A'
    AND a.course_id IS NOT NULL
)
DELETE FROM student_course_enrollments e
USING sem3_students s, tenant t
WHERE e.tenant_id = t.tenant_id
  AND e.student_user_id = s.user_id
  AND e.semester = 3
  AND e.status = 'ENROLLED'
  AND e.course_id NOT IN (SELECT course_id FROM iii_a_courses);

-- Fix Hardik: was incorrectly enrolled in sem-3 CS3001
DELETE FROM student_course_enrollments e
USING users u
WHERE e.student_user_id = u.user_id
  AND lower(u.official_email) = 'hardik.2347602@mygyanvihar.com'
  AND e.semester = 3;

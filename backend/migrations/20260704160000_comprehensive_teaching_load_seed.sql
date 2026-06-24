-- Comprehensive SGVU teaching loads (Master PDF excerpt) — 2026-2027.
-- Extends real_university_data_seed with multi-section faculty loads.

WITH prog AS (
  SELECT program_id FROM iam_programs WHERE deleted_at IS NULL ORDER BY program_id LIMIT 1
)
INSERT INTO academic_subjects (subject_code, subject_name, subject_shortname, program_id, credits, subject_type, is_active)
SELECT v.subject_code, v.subject_name, v.subject_shortname, p.program_id, v.credits, v.subject_type, true
FROM prog p
CROSS JOIN (VALUES
  ('CS3101', 'Introduction to AI',                         'AI',      2, 'THEORY'),
  ('CS3151', 'Introduction to AI Lab',                      'AI Lab',  1, 'LAB'),
  ('CS3002', 'Principles of Programming Languages',         'PPL',     3, 'THEORY'),
  ('CP325',  'Natural Language Processing',                 'NLP',     2, 'THEORY'),
  ('CP399',  'Natural Language Processing Lab',             'NLP Lab', 1, 'LAB'),
  ('CP352',  'Computer Architectures Lab',                  'CA Lab',  1, 'LAB'),
  ('OE303',  'Water and Waste Management in Smart Cities',  'OE 303',  3, 'THEORY'),
  ('CP455',  'Operating System Lab',                        'OS Lab',  1, 'LAB'),
  ('EM401',  'Employability Skills - VI',                   'ES VI',   1, 'SKILL')
) AS v(subject_code, subject_name, subject_shortname, credits, subject_type)
ON CONFLICT (subject_code) DO UPDATE SET
  subject_name = EXCLUDED.subject_name,
  subject_shortname = EXCLUDED.subject_shortname,
  credits = EXCLUDED.credits,
  subject_type = EXCLUDED.subject_type,
  is_active = true,
  updated_at = NOW();

-- Ensure CP302 / CP405 catalog rows stay current (may already exist).
WITH prog AS (
  SELECT program_id FROM iam_programs WHERE deleted_at IS NULL ORDER BY program_id LIMIT 1
)
INSERT INTO academic_subjects (subject_code, subject_name, subject_shortname, program_id, credits, subject_type, is_active)
SELECT v.subject_code, v.subject_name, v.subject_shortname, p.program_id, v.credits, v.subject_type, true
FROM prog p
CROSS JOIN (VALUES
  ('CP302', 'Computer Architectures', 'CA', 3, 'THEORY'),
  ('CP405', 'Operating Systems',      'OS', 3, 'THEORY')
) AS v(subject_code, subject_name, subject_shortname, credits, subject_type)
ON CONFLICT (subject_code) DO UPDATE SET
  subject_name = EXCLUDED.subject_name,
  subject_shortname = EXCLUDED.subject_shortname,
  credits = EXCLUDED.credits,
  subject_type = EXCLUDED.subject_type,
  is_active = true,
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- LMS courses for all mapped subjects
-- ---------------------------------------------------------------------------
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
subject_rows AS (
  SELECT subject_id, subject_code, subject_name, credits
  FROM academic_subjects
  WHERE subject_code IN (
    'CS3101', 'CS3151', 'CS3002', 'CP325', 'CP399', 'CP302', 'CP352',
    'OE303', 'CP405', 'CP455', 'EM401'
  )
)
INSERT INTO academic_courses (tenant_id, course_code, course_name, credits, is_elective)
SELECT t.tenant_id, s.subject_code, s.subject_name, s.credits, false
FROM tenant t
CROSS JOIN subject_rows s
ON CONFLICT (tenant_id, course_code) DO UPDATE SET
  course_name = EXCLUDED.course_name,
  credits = EXCLUDED.credits;

-- ---------------------------------------------------------------------------
-- Multi-load faculty allocations
-- ---------------------------------------------------------------------------
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
subject_rows AS (
  SELECT subject_id, subject_code FROM academic_subjects
  WHERE subject_code IN (
    'CS3101', 'CS3151', 'CS3002', 'CP325', 'CP399', 'CP302', 'CP352',
    'OE303', 'CP405', 'CP455', 'EM401'
  )
),
course_rows AS (
  SELECT course_id, course_code FROM academic_courses
  WHERE course_code IN (
    'CS3101', 'CS3151', 'CS3002', 'CP325', 'CP399', 'CP302', 'CP352',
    'OE303', 'CP405', 'CP455', 'EM401'
  )
),
allocations AS (
  SELECT * FROM (VALUES
    ('CS3101', 'BTECH CSE', 'III-A', 'naman.raj@mygyanvihar.com'),
    ('CS3151', 'BTECH CSE', 'III-A', 'naman.raj@mygyanvihar.com'),
    ('CP325',  'BTECH CSE', 'V-A',   'naman.raj@mygyanvihar.com'),
    ('CP325',  'BTECH CSE', 'V-B',   'naman.raj@mygyanvihar.com'),
    ('CP399',  'BTECH CSE', 'V-A',   'naman.raj@mygyanvihar.com'),
    ('CP302',  'BTECH CSE', 'V-A',   'rahul.kumar1@mygyanvihar.com'),
    ('CP302',  'BTECH CSE', 'V-B',   'rahul.kumar1@mygyanvihar.com'),
    ('CP352',  'BTECH CSE', 'V-A',   'rahul.kumar1@mygyanvihar.com'),
    ('OE303',  'BTECH CSE', 'V-A',   'rahul.kumar1@mygyanvihar.com'),
    ('EM401',  'BTECH CSE', 'VII-A', 'rahul.kumar1@mygyanvihar.com'),
    ('CS3002', 'BTECH CSE', 'III-A', 'priyanka1.gupta@mygyanvihar.com'),
    ('CP405',  'BTECH CSE', 'VII-A', 'priyanka1.gupta@mygyanvihar.com'),
    ('CP405',  'BTECH CSE', 'VII-B', 'priyanka1.gupta@mygyanvihar.com'),
    ('CP455',  'BTECH CSE', 'VII-A', 'priyanka1.gupta@mygyanvihar.com'),
    ('CP455',  'BTECH CSE', 'VII-B', 'priyanka1.gupta@mygyanvihar.com')
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
JOIN users u ON lower(u.official_email) = lower(a.faculty_email)
JOIN course_rows c ON c.course_code = s.subject_code
CROSS JOIN tenant t
ON CONFLICT (tenant_id, subject_id, program_name, semester, academic_year) DO UPDATE SET
  faculty_user_id = EXCLUDED.faculty_user_id,
  course_id = EXCLUDED.course_id,
  status = 'ACTIVE',
  updated_at = NOW();

-- Timetable slots for every active allocation (faculty LMS access).
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
  AND NOT EXISTS (
    SELECT 1 FROM academic_timetables t
    WHERE t.tenant_id = a.tenant_id
      AND t.course_id = a.course_id
      AND t.faculty_user_id = a.faculty_user_id
  );

-- Section labels on existing enrollments for cross-section visibility.
UPDATE student_course_enrollments e
SET section_code = data.section_code
FROM users u
JOIN (VALUES
  ('munmun.2549711@mygyanvihar.com',  'A'),
  ('sakshi.2548515@mygyanvihar.com',  'A'),
  ('prasoon.2548543@mygyanvihar.com', 'A'),
  ('aniketsain45@gmail.com',          'A'),
  ('sumit.23181508@mygyanvihar.com',  'A'),
  ('samir.2347454@mygyanvihar.com',   'A'),
  ('hardik.2347602@mygyanvihar.com',  'A'),
  ('nasreen.2547973@mygyanvihar.com', 'A'),
  ('rahul.2548184@mygyanvihar.com',   'B')
) AS data(email, section_code) ON lower(u.official_email) = lower(data.email)
WHERE e.student_user_id = u.user_id;

-- Enroll sem-5 students into Rahul Kumar's V-A theory load.
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
course_map AS (
  SELECT course_id, course_code FROM academic_courses
  WHERE course_code IN ('CP302', 'OE303')
)
INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, section_code, status)
SELECT t.tenant_id, u.user_id, c.course_id, 5, 'A', 'ENROLLED'
FROM users u
CROSS JOIN course_map c
CROSS JOIN tenant t
WHERE lower(u.official_email) IN (
  'hardik.2347602@mygyanvihar.com',
  'nasreen.2547973@mygyanvihar.com'
)
ON CONFLICT (tenant_id, student_user_id, course_id) DO UPDATE SET
  semester = EXCLUDED.semester,
  section_code = EXCLUDED.section_code,
  status = 'ENROLLED';

-- Enroll Rahul (sem 5, section B) into CP302 V-B.
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
)
INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, section_code, status)
SELECT t.tenant_id, u.user_id, c.course_id, 5, 'B', 'ENROLLED'
FROM users u
JOIN academic_courses c ON c.course_code = 'CP302'
CROSS JOIN tenant t
WHERE lower(u.official_email) = 'rahul.2548184@mygyanvihar.com'
ON CONFLICT (tenant_id, student_user_id, course_id) DO UPDATE SET
  semester = EXCLUDED.semester,
  section_code = EXCLUDED.section_code,
  status = 'ENROLLED';

-- Enroll sem-3 students into Priyanka's PPL (CS3002).
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
)
INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, section_code, status)
SELECT t.tenant_id, u.user_id, c.course_id, 3, 'A', 'ENROLLED'
FROM users u
JOIN academic_courses c ON c.course_code = 'CS3002'
CROSS JOIN tenant t
WHERE lower(u.official_email) IN (
  'munmun.2549711@mygyanvihar.com',
  'sakshi.2548515@mygyanvihar.com',
  'prasoon.2548543@mygyanvihar.com',
  'aniketsain45@gmail.com'
)
ON CONFLICT (tenant_id, student_user_id, course_id) DO UPDATE SET
  semester = EXCLUDED.semester,
  section_code = EXCLUDED.section_code,
  status = 'ENROLLED';

-- Enroll sem-3 students into Naman's AI theory + lab.
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
)
INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, section_code, status)
SELECT t.tenant_id, u.user_id, c.course_id, 3, 'A', 'ENROLLED'
FROM users u
JOIN academic_courses c ON c.course_code IN ('CS3101', 'CS3151')
CROSS JOIN tenant t
WHERE lower(u.official_email) IN (
  'munmun.2549711@mygyanvihar.com',
  'sakshi.2548515@mygyanvihar.com',
  'prasoon.2548543@mygyanvihar.com',
  'aniketsain45@gmail.com'
)
ON CONFLICT (tenant_id, student_user_id, course_id) DO UPDATE SET
  semester = EXCLUDED.semester,
  section_code = EXCLUDED.section_code,
  status = 'ENROLLED';

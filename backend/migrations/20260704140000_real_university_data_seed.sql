-- Real SGVU faculty, students, subjects, allocations, and enrollments (2026-2027).
-- Default password: password123 ($2b$10$3M.gdiob7z... — same as other QA personas)
-- Tenant: sgvu | Dept: Computer Science

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE role_name = 'Student') THEN
    INSERT INTO roles (role_name, description)
    VALUES ('Student', 'Application role for Student portal access');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM roles WHERE role_name = 'Faculty') THEN
    INSERT INTO roles (role_name, description)
    VALUES ('Faculty', 'Application role for Faculty portal access');
  END IF;
END $$;

INSERT INTO departments (dept_name, description)
VALUES ('Computer Science', 'School of Computing & IT')
ON CONFLICT (dept_name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1. REAL FACULTY
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
    ('f3000001-0000-4000-8000-000000000001'::uuid, 'Naman Raj',      'naman.raj@mygyanvihar.com'),
    ('f3000002-0000-4000-8000-000000000002'::uuid, 'Rahul Kumar',    'rahul.kumar1@mygyanvihar.com'),
    ('f3000003-0000-4000-8000-000000000003'::uuid, 'Priyanka Gupta', 'priyanka1.gupta@mygyanvihar.com'),
    ('f3000004-0000-4000-8000-000000000004'::uuid, 'Pooja Varshney', 'pooja.varshney@mygyanvihar.com'),
    ('f3000005-0000-4000-8000-000000000005'::uuid, 'Samali Ghosh',   'samali.ghosh@mygyanvihar.com'),
    ('f3000006-0000-4000-8000-000000000006'::uuid, 'Neha Ranga',     'neha.ranga@mygyanvihar.com')
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
  password_hash = EXCLUDED.password_hash,
  is_active = true,
  onboarding_status = 'ACTIVE',
  onboarding_profile = '{}'::jsonb;

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u
WHERE lower(u.official_email) IN (
  'naman.raj@mygyanvihar.com',
  'rahul.kumar1@mygyanvihar.com',
  'priyanka1.gupta@mygyanvihar.com',
  'pooja.varshney@mygyanvihar.com',
  'samali.ghosh@mygyanvihar.com',
  'neha.ranga@mygyanvihar.com'
)
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

-- ---------------------------------------------------------------------------
-- 2. REAL STUDENTS
-- ---------------------------------------------------------------------------
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
dept AS (
  SELECT dept_id FROM departments WHERE dept_name = 'Computer Science' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
seed_students AS (
  SELECT * FROM (VALUES
    ('f4000001-0000-4000-8000-000000000001'::uuid, 'Sumit Prakash',  'sumit.23181508@mygyanvihar.com',  '23181508', 7),
    ('f4000002-0000-4000-8000-000000000002'::uuid, 'Samir Srinath',  'samir.2347454@mygyanvihar.com',   '2347454',  7),
    ('f4000003-0000-4000-8000-000000000003'::uuid, 'Munmun Kumari',  'munmun.2549711@mygyanvihar.com',  '2549711',  3),
    ('f4000004-0000-4000-8000-000000000004'::uuid, 'Sakshi',         'sakshi.2548515@mygyanvihar.com',  '2548515',  3),
    ('f4000005-0000-4000-8000-000000000005'::uuid, 'Prasoon Sharma', 'prasoon.2548543@mygyanvihar.com', '2548543',  3),
    ('f4000006-0000-4000-8000-000000000006'::uuid, 'Aniket Sain',    'aniketsain45@gmail.com',          '2548543A', 3),
    ('f4000007-0000-4000-8000-000000000007'::uuid, 'Hardik Gaur',    'hardik.2347602@mygyanvihar.com',  '2347602',  5),
    ('f4000008-0000-4000-8000-000000000008'::uuid, 'Nasreen Praveen','nasreen.2547973@mygyanvihar.com', '2547973',  5),
    ('f4000009-0000-4000-8000-000000000009'::uuid, 'Rahul',          'rahul.2548184@mygyanvihar.com',   '2548184',  5)
  ) AS s(user_id, name, email, enrollment_no, semester_num)
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, is_active, onboarding_status, onboarding_profile
)
SELECT
  ss.user_id, t.tenant_id, ss.name, ss.email, r.role_id, d.dept_id,
  p.hash, true, 'PENDING_PASSWORD_RESET', '{}'::jsonb
FROM seed_students ss
CROSS JOIN tenant t
CROSS JOIN pwd p
CROSS JOIN dept d
JOIN roles r ON r.role_name = 'Student'
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  dept_id = EXCLUDED.dept_id,
  password_hash = EXCLUDED.password_hash,
  is_active = true,
  onboarding_status = 'PENDING_PASSWORD_RESET',
  onboarding_profile = '{}'::jsonb;

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u
WHERE lower(u.official_email) IN (
  'sumit.23181508@mygyanvihar.com',
  'samir.2347454@mygyanvihar.com',
  'munmun.2549711@mygyanvihar.com',
  'sakshi.2548515@mygyanvihar.com',
  'prasoon.2548543@mygyanvihar.com',
  'aniketsain45@gmail.com',
  'hardik.2347602@mygyanvihar.com',
  'nasreen.2547973@mygyanvihar.com',
  'rahul.2548184@mygyanvihar.com'
)
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

INSERT INTO student_profiles (
  tenant_id, user_id, enrollment_no, enrollment_number, admission_number,
  batch, nationality, admission_status, status
)
SELECT
  u.tenant_id,
  u.user_id,
  data.enrollment_no,
  data.enrollment_no,
  data.enrollment_no,
  'BTECH CSE',
  'Indian',
  'ACTIVE',
  'ACTIVE'
FROM users u
JOIN (VALUES
  ('sumit.23181508@mygyanvihar.com',  '23181508'),
  ('samir.2347454@mygyanvihar.com',   '2347454'),
  ('munmun.2549711@mygyanvihar.com',  '2549711'),
  ('sakshi.2548515@mygyanvihar.com',  '2548515'),
  ('prasoon.2548543@mygyanvihar.com', '2548543'),
  ('aniketsain45@gmail.com',          'ANIKET45'),
  ('hardik.2347602@mygyanvihar.com',  '2347602'),
  ('nasreen.2547973@mygyanvihar.com', '2547973'),
  ('rahul.2548184@mygyanvihar.com',   '2548184')
) AS data(email, enrollment_no) ON lower(u.official_email) = lower(data.email)
ON CONFLICT (user_id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  enrollment_no = EXCLUDED.enrollment_no,
  enrollment_number = EXCLUDED.enrollment_number,
  admission_number = EXCLUDED.admission_number,
  batch = EXCLUDED.batch,
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 3. REAL SUBJECTS (catalog)
-- ---------------------------------------------------------------------------
WITH prog AS (
  SELECT program_id FROM iam_programs WHERE deleted_at IS NULL ORDER BY program_id LIMIT 1
)
INSERT INTO academic_subjects (subject_code, subject_name, subject_shortname, program_id, credits, subject_type, is_active)
SELECT v.subject_code, v.subject_name, v.subject_shortname, p.program_id, v.credits, v.subject_type, true
FROM prog p
CROSS JOIN (VALUES
  ('CP 325', 'Natural Language Processing',        'NLP', 2, 'THEORY'),
  ('CP302',  'Computer Architectures',             'CA',  3, 'THEORY'),
  ('CP405',  'Operating Systems',                  'OS',  3, 'THEORY'),
  ('CS3001', 'Data Structures and Algorithms',     'DSA', 3, 'THEORY'),
  ('CSY001', 'Software Project Management',        'SPM', 3, 'THEORY'),
  ('EEPI',   'Election and Electoral Processes in India', 'EEP', 0, 'THEORY')
) AS v(subject_code, subject_name, subject_shortname, credits, subject_type)
ON CONFLICT (subject_code) DO UPDATE SET
  subject_name = EXCLUDED.subject_name,
  subject_shortname = EXCLUDED.subject_shortname,
  credits = EXCLUDED.credits,
  subject_type = EXCLUDED.subject_type,
  is_active = true,
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 4. LMS COURSES + FACULTY ALLOCATIONS + TIMETABLE SLOTS
-- ---------------------------------------------------------------------------
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
subject_rows AS (
  SELECT subject_id, subject_code, subject_name, credits
  FROM academic_subjects
  WHERE subject_code IN ('CP 325', 'CP302', 'CP405', 'CS3001', 'CSY001', 'EEPI')
),
upsert_courses AS (
  INSERT INTO academic_courses (tenant_id, course_code, course_name, credits, is_elective)
  SELECT t.tenant_id, s.subject_code, s.subject_name, s.credits, false
  FROM tenant t
  CROSS JOIN subject_rows s
  ON CONFLICT (tenant_id, course_code) DO UPDATE SET
    course_name = EXCLUDED.course_name,
    credits = EXCLUDED.credits
  RETURNING course_id, course_code
),
allocations AS (
  SELECT * FROM (VALUES
    ('CP 325', 'BTECH CSE', 'V-A',   'naman.raj@mygyanvihar.com'),
    ('CP302',  'BTECH CSE', 'V-A',   'rahul.kumar1@mygyanvihar.com'),
    ('CP405',  'BTECH CSE', 'VII-A', 'priyanka1.gupta@mygyanvihar.com'),
    ('CS3001', 'BTECH CSE', 'III-B', 'pooja.varshney@mygyanvihar.com')
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
JOIN upsert_courses c ON c.course_code = s.subject_code
CROSS JOIN tenant t
ON CONFLICT (tenant_id, subject_id, program_name, semester, academic_year) DO UPDATE SET
  faculty_user_id = EXCLUDED.faculty_user_id,
  course_id = EXCLUDED.course_id,
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
  AND NOT EXISTS (
    SELECT 1 FROM academic_timetables t
    WHERE t.tenant_id = a.tenant_id
      AND t.course_id = a.course_id
      AND t.faculty_user_id = a.faculty_user_id
  );

-- ---------------------------------------------------------------------------
-- 5. ENROLL STUDENTS IN REAL CLASSES
-- ---------------------------------------------------------------------------
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
course_map AS (
  SELECT course_id, course_code FROM academic_courses
  WHERE course_code IN ('CS3001', 'CP405')
)
INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, status)
SELECT t.tenant_id, u.user_id, c.course_id, data.semester_num, 'ENROLLED'
FROM (VALUES
  ('munmun.2549711@mygyanvihar.com',  'CS3001', 3),
  ('sakshi.2548515@mygyanvihar.com',  'CS3001', 3),
  ('prasoon.2548543@mygyanvihar.com', 'CS3001', 3),
  ('aniketsain45@gmail.com',          'CS3001', 3),
  ('sumit.23181508@mygyanvihar.com',  'CP405',  7),
  ('samir.2347454@mygyanvihar.com',   'CP405',  7)
) AS data(email, course_code, semester_num)
JOIN users u ON lower(u.official_email) = lower(data.email)
JOIN course_map c ON c.course_code = data.course_code
CROSS JOIN tenant t
ON CONFLICT (tenant_id, student_user_id, course_id) DO UPDATE SET
  semester = EXCLUDED.semester,
  status = 'ENROLLED';

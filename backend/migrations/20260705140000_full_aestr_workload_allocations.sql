-- Complete AESTR BTECH CSE workload allocations for V/VII sections.
-- Keeps one active allocation per PDF row, including repeated faculty/course loads
-- across multiple semester-section combinations.

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
    ('f3000011-0000-4000-8000-000000000011'::uuid, 'Lubna Aggarwal',    'lubna.aggarwal@mygyanvihar.com'),
    ('f3000012-0000-4000-8000-000000000012'::uuid, 'Shambhawi Thakur',  'shambhawi.thakur@mygyanvihar.com')
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
  'lubna.aggarwal@mygyanvihar.com',
  'shambhawi.thakur@mygyanvihar.com'
)
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

-- Older smoke/demo rows covered only a subset of V/VII and used mixed course codes.
UPDATE academic_course_allocations
SET status = 'INACTIVE', updated_at = NOW()
WHERE academic_year = '2026-2027'
  AND program_name = 'BTECH CSE'
  AND semester IN ('V-A', 'V-B', 'VII-A', 'VII-B');

WITH prog AS (
  SELECT program_id FROM iam_programs WHERE deleted_at IS NULL ORDER BY program_id LIMIT 1
)
INSERT INTO academic_subjects (subject_code, subject_name, subject_shortname, program_id, credits, subject_type, is_active)
SELECT v.subject_code, v.subject_name, v.subject_shortname, p.program_id, v.credits, v.subject_type, true
FROM prog p
CROSS JOIN (VALUES
  ('EM 301',  'Employability Skills-III',                                      'ES III',      1, 'SKILL'),
  ('PC 301',  'Proficiency and Co-Curricular Activities-V',                    'DECCA V',     2, 'LAB'),
  ('CP301',   'Database Management System',                                    'DBMS',        3, 'THEORY'),
  ('CP309',   'Logical & Functional Programming',                              'LFP',         3, 'THEORY'),
  ('CP 323',  'Data Science - Tools and Techniques',                           'DSTT',        2, 'THEORY'),
  ('CP 325',  'Natural Language Processing',                                   'NLP',         2, 'THEORY'),
  ('CP302',   'Computer Architectures',                                        'CA',          3, 'THEORY'),
  ('CP352',   'Computer Architectures Lab',                                    'CA Lab',      1, 'LAB'),
  ('CP353',   'Database Management System Lab',                                'DBMS Lab',    1, 'LAB'),
  ('CP 397',  'Data Science - Tools and Techniques Lab',                       'DSTT Lab',    1, 'LAB'),
  ('CP 399',  'Natural Language Processing Lab',                               'NLP Lab',     1, 'LAB'),
  ('PT 303',  'Industrial Training Seminar',                                   'ITS Lab',     2, 'LAB'),
  ('UC 351',  'Field Project/Field Visit-5',                                   'Field Visit', 2, 'LAB'),
  ('CP319',   'Advanced Web Development',                                      'AWD',         3, 'THEORY'),
  ('CP359',   'Advanced Web Development Lab',                                  'AWD Lab',     1, 'LAB'),
  ('OE303',   'Water and Waste Management in Smart Cities',                    'OE 303',      3, 'THEORY'),
  ('OE305',   'Nano-Intelligence: Advanced Materials & Computational Approaches in Nanotechnology', 'OE 305', 3, 'THEORY'),
  ('OE307',   'Principles of Robotics',                                        'OE 307',      3, 'THEORY'),
  ('OE309',   'Fundamental of Genomics',                                       'OE 309',      3, 'THEORY'),
  ('EM 401',  'Employability Skills -VI',                                      'ES VI',       1, 'SKILL'),
  ('PC 401',  'Proficiency and Co-Curricular Activities-VII',                  'DECCA VII',   2, 'LAB'),
  ('CP402',   'Network Security & Cryptography Fundamentals',                  'NSCF',        3, 'THEORY'),
  ('CP405',   'Operating Systems',                                             'OS',          3, 'THEORY'),
  ('CP401',   'Asynchronous Transfer Mode',                                    'ATM',         3, 'THEORY'),
  ('CP407',   'Intro to Data Mining & Warehousing',                            'DMW',         3, 'THEORY'),
  ('CP 423',  'Computer Vision',                                               'CV',          2, 'THEORY'),
  ('CP 425',  'Computer Vision Lab',                                           'CV Lab',      1, 'LAB'),
  ('CP 499',  'Network Security & Cryptography Fundamentals Lab',              'NSCF Lab',    1, 'LAB'),
  ('CP 455',  'Operating System Lab',                                          'OS Lab',      1, 'LAB'),
  ('PE403',   'Major Project Stage-I',                                         'MP Lab',      1, 'LAB'),
  ('PT 403',  'Industrial Training Seminar',                                   'ITS Lab',     2, 'LAB'),
  ('UC 451',  'Field Project/Field Visit -7',                                  'Field Visit', 2, 'LAB'),
  ('CP413',   'Digital Image Processing',                                      'DIP',         3, 'THEORY')
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
    'EM 301', 'PC 301', 'CP301', 'CP309', 'CP 323', 'CP 325', 'CP302', 'CP352',
    'CP353', 'CP 397', 'CP 399', 'PT 303', 'UC 351', 'CP319', 'CP359',
    'OE303', 'OE305', 'OE307', 'OE309', 'EM 401', 'PC 401', 'CP402', 'CP405',
    'CP401', 'CP407', 'CP 423', 'CP 425', 'CP 499', 'CP 455', 'PE403',
    'PT 403', 'UC 451', 'CP413'
  )
)
INSERT INTO academic_courses (tenant_id, course_code, course_name, credits, is_elective, course_type)
SELECT
  t.tenant_id,
  s.subject_code,
  s.subject_name,
  s.credits,
  s.subject_code LIKE 'OE%',
  CASE WHEN s.subject_code LIKE 'OE%' THEN 'ELECTIVE' ELSE 'CORE' END
FROM tenant t
CROSS JOIN subject_rows s
ON CONFLICT (tenant_id, course_code) DO UPDATE SET
  course_name = EXCLUDED.course_name,
  credits = EXCLUDED.credits,
  is_elective = EXCLUDED.is_elective,
  course_type = EXCLUDED.course_type;

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
    ('EM 301', 'BTECH CSE', 'V-A', 'nasreen.praveen@mygyanvihar.com'),
    ('PC 301', 'BTECH CSE', 'V-A', 'priyanka1.gupta@mygyanvihar.com'),
    ('CP301',  'BTECH CSE', 'V-A', 'samali.ghosh@mygyanvihar.com'),
    ('CP309',  'BTECH CSE', 'V-A', 'neha.ranga@mygyanvihar.com'),
    ('CP 323', 'BTECH CSE', 'V-A', 'nasreen.praveen@mygyanvihar.com'),
    ('CP 325', 'BTECH CSE', 'V-A', 'naman.raj@mygyanvihar.com'),
    ('CP302',  'BTECH CSE', 'V-A', 'rahul.kumar1@mygyanvihar.com'),
    ('CP352',  'BTECH CSE', 'V-A', 'rahul.kumar1@mygyanvihar.com'),
    ('CP353',  'BTECH CSE', 'V-A', 'samali.ghosh@mygyanvihar.com'),
    ('CP 397', 'BTECH CSE', 'V-A', 'nasreen.praveen@mygyanvihar.com'),
    ('CP 399', 'BTECH CSE', 'V-A', 'naman.raj@mygyanvihar.com'),
    ('PT 303', 'BTECH CSE', 'V-A', 'lubna.aggarwal@mygyanvihar.com'),
    ('UC 351', 'BTECH CSE', 'V-A', 'naman.raj@mygyanvihar.com'),
    ('CP319',  'BTECH CSE', 'V-A', 'shambhawi.thakur@mygyanvihar.com'),
    ('CP359',  'BTECH CSE', 'V-A', NULL),
    ('OE303',  'BTECH CSE', 'V-A', 'rahul.kumar1@mygyanvihar.com'),
    ('OE305',  'BTECH CSE', 'V-A', 'rahul.kumar1@mygyanvihar.com'),
    ('OE307',  'BTECH CSE', 'V-A', 'rahul.kumar1@mygyanvihar.com'),
    ('OE309',  'BTECH CSE', 'V-A', 'rahul.kumar1@mygyanvihar.com'),
    ('EM 301', 'BTECH CSE', 'V-B', 'nasreen.praveen@mygyanvihar.com'),
    ('PC 301', 'BTECH CSE', 'V-B', 'nasreen.praveen@mygyanvihar.com'),
    ('CP301',  'BTECH CSE', 'V-B', NULL),
    ('CP309',  'BTECH CSE', 'V-B', 'neha.ranga@mygyanvihar.com'),
    ('CP 323', 'BTECH CSE', 'V-B', 'nasreen.praveen@mygyanvihar.com'),
    ('CP 325', 'BTECH CSE', 'V-B', 'naman.raj@mygyanvihar.com'),
    ('CP302',  'BTECH CSE', 'V-B', 'rahul.kumar1@mygyanvihar.com'),
    ('CP352',  'BTECH CSE', 'V-B', 'rahul.kumar1@mygyanvihar.com'),
    ('CP353',  'BTECH CSE', 'V-B', NULL),
    ('CP 397', 'BTECH CSE', 'V-B', 'nasreen.praveen@mygyanvihar.com'),
    ('CP 399', 'BTECH CSE', 'V-B', 'naman.raj@mygyanvihar.com'),
    ('PT 303', 'BTECH CSE', 'V-B', 'lubna.aggarwal@mygyanvihar.com'),
    ('UC 351', 'BTECH CSE', 'V-B', 'naman.raj@mygyanvihar.com'),
    ('CP319',  'BTECH CSE', 'V-B', 'shambhawi.thakur@mygyanvihar.com'),
    ('CP359',  'BTECH CSE', 'V-B', NULL),
    ('OE303',  'BTECH CSE', 'V-B', 'rahul.kumar1@mygyanvihar.com'),
    ('OE305',  'BTECH CSE', 'V-B', 'rahul.kumar1@mygyanvihar.com'),
    ('OE307',  'BTECH CSE', 'V-B', 'rahul.kumar1@mygyanvihar.com'),
    ('OE309',  'BTECH CSE', 'V-B', 'rahul.kumar1@mygyanvihar.com'),
    ('EM 401', 'BTECH CSE', 'VII-A', 'rahul.kumar1@mygyanvihar.com'),
    ('PC 401', 'BTECH CSE', 'VII-A', 'rahul.kumar1@mygyanvihar.com'),
    ('CP402',  'BTECH CSE', 'VII-A', 'nasreen.praveen@mygyanvihar.com'),
    ('CP405',  'BTECH CSE', 'VII-A', 'priyanka1.gupta@mygyanvihar.com'),
    ('CP401',  'BTECH CSE', 'VII-A', 'bhanu.pratap@mygyanvihar.com'),
    ('CP407',  'BTECH CSE', 'VII-A', 'pooja.varshney@mygyanvihar.com'),
    ('CP 423', 'BTECH CSE', 'VII-A', 'neha.ranga@mygyanvihar.com'),
    ('CP 425', 'BTECH CSE', 'VII-A', 'neha.ranga@mygyanvihar.com'),
    ('CP 499', 'BTECH CSE', 'VII-A', 'samali.ghosh@mygyanvihar.com'),
    ('CP 455', 'BTECH CSE', 'VII-A', 'priyanka1.gupta@mygyanvihar.com'),
    ('PE403',  'BTECH CSE', 'VII-A', 'himanshu.varshney@mygyanvihar.com'),
    ('PT 403', 'BTECH CSE', 'VII-A', 'lubna.aggarwal@mygyanvihar.com'),
    ('UC 451', 'BTECH CSE', 'VII-A', 'naman.raj@mygyanvihar.com'),
    ('CP413',  'BTECH CSE', 'VII-A', 'bhanu.pratap@mygyanvihar.com'),
    ('EM 401', 'BTECH CSE', 'VII-B', 'rahul.kumar1@mygyanvihar.com'),
    ('PC 401', 'BTECH CSE', 'VII-B', 'pooja.varshney@mygyanvihar.com'),
    ('CP402',  'BTECH CSE', 'VII-B', NULL),
    ('CP405',  'BTECH CSE', 'VII-B', 'priyanka1.gupta@mygyanvihar.com'),
    ('CP401',  'BTECH CSE', 'VII-B', 'bhanu.pratap@mygyanvihar.com'),
    ('CP407',  'BTECH CSE', 'VII-B', 'pooja.varshney@mygyanvihar.com'),
    ('CP 423', 'BTECH CSE', 'VII-B', 'neha.ranga@mygyanvihar.com'),
    ('CP 425', 'BTECH CSE', 'VII-B', 'neha.ranga@mygyanvihar.com'),
    ('CP 499', 'BTECH CSE', 'VII-B', NULL),
    ('CP 455', 'BTECH CSE', 'VII-B', 'rahul.kumar1@mygyanvihar.com'),
    ('PE403',  'BTECH CSE', 'VII-B', 'shambhawi.thakur@mygyanvihar.com'),
    ('PT 403', 'BTECH CSE', 'VII-B', 'lubna.aggarwal@mygyanvihar.com'),
    ('UC 451', 'BTECH CSE', 'VII-B', 'naman.raj@mygyanvihar.com'),
    ('CP413',  'BTECH CSE', 'VII-B', 'bhanu.pratap@mygyanvihar.com')
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
  AND a.program_name = 'BTECH CSE'
  AND a.semester IN ('V-A', 'V-B', 'VII-A', 'VII-B')
  AND a.status = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1 FROM academic_timetables t
    WHERE t.tenant_id = a.tenant_id
      AND t.course_id = a.course_id
      AND t.faculty_user_id = a.faculty_user_id
  );

WITH student_slots AS (
  SELECT u.user_id, sp.tenant_id, sp.current_semester, sp.section_code, sp.batch
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  WHERE sp.current_semester IS NOT NULL
),
matching_allocations AS (
  SELECT
    s.user_id,
    s.tenant_id,
    s.current_semester,
    s.section_code,
    a.course_id
  FROM student_slots s
  JOIN academic_course_allocations a ON a.tenant_id = s.tenant_id
  WHERE a.academic_year = '2026-2027'
    AND a.status = 'ACTIVE'
    AND a.course_id IS NOT NULL
    AND upper(replace(COALESCE(a.program_name, ''), ' ', '')) = upper(replace(COALESCE(s.batch, 'BTECH CSE'), ' ', ''))
    AND CASE upper(split_part(COALESCE(a.semester, ''), '-', 1))
      WHEN 'I' THEN 1 WHEN 'II' THEN 2 WHEN 'III' THEN 3 WHEN 'IV' THEN 4
      WHEN 'V' THEN 5 WHEN 'VI' THEN 6 WHEN 'VII' THEN 7 WHEN 'VIII' THEN 8
      ELSE NULL END = s.current_semester
    AND (
      s.section_code IS NULL
      OR split_part(COALESCE(a.semester, ''), '-', 2) = ''
      OR upper(split_part(a.semester, '-', 2)) = upper(s.section_code)
    )
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

WITH student_slots AS (
  SELECT u.user_id, sp.tenant_id, sp.current_semester, sp.section_code, sp.batch
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  WHERE sp.current_semester IS NOT NULL
),
valid_pairs AS (
  SELECT DISTINCT s.user_id, s.tenant_id, s.current_semester, a.course_id
  FROM student_slots s
  JOIN academic_course_allocations a ON a.tenant_id = s.tenant_id
  WHERE a.academic_year = '2026-2027'
    AND a.status = 'ACTIVE'
    AND a.course_id IS NOT NULL
    AND upper(replace(COALESCE(a.program_name, ''), ' ', '')) = upper(replace(COALESCE(s.batch, 'BTECH CSE'), ' ', ''))
    AND CASE upper(split_part(COALESCE(a.semester, ''), '-', 1))
      WHEN 'I' THEN 1 WHEN 'II' THEN 2 WHEN 'III' THEN 3 WHEN 'IV' THEN 4
      WHEN 'V' THEN 5 WHEN 'VI' THEN 6 WHEN 'VII' THEN 7 WHEN 'VIII' THEN 8
      ELSE NULL END = s.current_semester
    AND (
      s.section_code IS NULL
      OR split_part(COALESCE(a.semester, ''), '-', 2) = ''
      OR upper(split_part(a.semester, '-', 2)) = upper(s.section_code)
    )
)
DELETE FROM student_course_enrollments e
USING student_slots s
WHERE e.tenant_id = s.tenant_id
  AND e.student_user_id = s.user_id
  AND e.semester = s.current_semester
  AND e.status = 'ENROLLED'
  AND NOT EXISTS (
    SELECT 1 FROM valid_pairs v
    WHERE v.user_id = e.student_user_id
      AND v.tenant_id = e.tenant_id
      AND v.current_semester = e.semester
      AND v.course_id = e.course_id
  );

-- AESTR (School of Computer Science) full teaching workload — Work load AESTR (1).pdf
-- Normalized course codes (no spaces). One allocation per (subject, program, section, year).
-- Default faculty password: password123

-- Strip spaces and drop spaced-code orphans when canonical code already exists.
DELETE FROM academic_courses spaced
 WHERE spaced.course_code ~ '\s'
   AND EXISTS (
     SELECT 1 FROM academic_courses canon
     WHERE canon.tenant_id = spaced.tenant_id
       AND canon.course_code = UPPER(REPLACE(TRIM(spaced.course_code), ' ', ''))
       AND canon.course_id <> spaced.course_id
   );

DELETE FROM academic_subjects spaced
 WHERE spaced.subject_code ~ '\s'
   AND EXISTS (
     SELECT 1 FROM academic_subjects canon
     WHERE canon.subject_code = UPPER(REPLACE(TRIM(spaced.subject_code), ' ', ''))
       AND canon.subject_id <> spaced.subject_id
   );

UPDATE academic_subjects s
   SET subject_code = UPPER(REPLACE(TRIM(s.subject_code), ' ', ''))
 WHERE s.subject_code ~ '\s'
   AND NOT EXISTS (
     SELECT 1 FROM academic_subjects x
     WHERE x.subject_id <> s.subject_id
       AND x.subject_code = UPPER(REPLACE(TRIM(s.subject_code), ' ', ''))
   );

UPDATE academic_courses c
   SET course_code = UPPER(REPLACE(TRIM(c.course_code), ' ', ''))
 WHERE c.course_code ~ '\s'
   AND NOT EXISTS (
     SELECT 1 FROM academic_courses x
     WHERE x.course_id <> c.course_id
       AND x.tenant_id = c.tenant_id
       AND x.course_code = UPPER(REPLACE(TRIM(c.course_code), ' ', ''))
   );

-- ---------------------------------------------------------------------------
-- 1. Additional faculty from workload sheet
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

-- ---------------------------------------------------------------------------
-- 2. Subject catalog (codes without spaces — PDF source)
-- ---------------------------------------------------------------------------
WITH prog AS (
  SELECT program_id FROM iam_programs WHERE deleted_at IS NULL ORDER BY program_id LIMIT 1
)
INSERT INTO academic_subjects (subject_code, subject_name, subject_shortname, program_id, credits, subject_type, is_active)
SELECT v.code, v.name, v.shortname, p.program_id, v.credits, v.stype, true
FROM prog p
CROSS JOIN (VALUES
  ('SODECA-III', 'Social Outreach, Discipline & Extra Curriculum Activities -III', 'SODECA-III', 2, 'LAB'),
  ('UC3002',     'Economics & Social Sciences',                                   'ESS',        3, 'THEORY'),
  ('EEPI',       'Election and Electoral Processes in India',                    'EEP',        0, 'THEORY'),
  ('CS3001',     'Data Structures and Algorithms',                               'DSA',        3, 'THEORY'),
  ('CS3002',     'Principles of Programming Languages',                          'PPL',        3, 'THEORY'),
  ('MA3004',     'Engineering Mathematics III',                                  'EM III',     3, 'THEORY'),
  ('CS3101',     'Introduction to AI',                                           'AI',         2, 'THEORY'),
  ('EC3001',     'Digital Logic Design',                                         'DLD',        2, 'THEORY'),
  ('CS3052',     'Data Structures and Algorithms Lab',                           'DSA Lab',    1, 'LAB'),
  ('CS3151',     'Introduction to AI Lab',                                       'AI Lab',     1, 'LAB'),
  ('CS3004',     'Innovation Lab III',                                           'IL III',     2, 'LAB'),
  ('EC3002',     'Digital Logic Design Lab',                                     'DLD Lab',    1, 'LAB'),
  ('EM301',      'Employability Skills-III',                                     'ES III',     1, 'SKILL'),
  ('PC301',      'Proficiency and Co-Curricular Activities-V',                    'DECCA V',    2, 'SKILL'),
  ('CP301',      'Database Management System',                                   'DBMS',       3, 'THEORY'),
  ('CP309',      'Logical & Functional Programming',                             'LFP',        3, 'THEORY'),
  ('CP323',      'Data Science - Tools and Techniques',                          'DSTT',       2, 'THEORY'),
  ('CP325',      'Natural Language Processing',                                  'NLP',        2, 'THEORY'),
  ('CP302',      'Computer Architectures',                                       'CA',         3, 'THEORY'),
  ('CP352',      'Computer Architectures Lab',                                   'CA Lab',     1, 'LAB'),
  ('CP353',      'Database Management System Lab',                               'DBMS Lab',   1, 'LAB'),
  ('CP397',      'Data Science - Tools and Techniques Lab',                      'DSTT Lab',   1, 'LAB'),
  ('CP399',      'Natural Language Processing Lab',                              'NLP Lab',    1, 'LAB'),
  ('PT303',      'Industrial Training Seminar',                                  'ITS',        1, 'LAB'),
  ('UC351',      'Field Project/Field Visit-5',                                  'Field Visit',1, 'LAB'),
  ('CP319',      'Advanced Web Development',                                     'AWD',        2, 'THEORY'),
  ('CP359',      'Advanced Web Development Lab',                                 'AWD Lab',    1, 'LAB'),
  ('OE303',      'Water and Waste Management in Smart Cities',                   'OE303',      3, 'THEORY'),
  ('OE305',      'Nano-Intelligence: Advanced Materials & Computational',        'OE305',      3, 'THEORY'),
  ('OE307',      'Principles of Robotics',                                       'OE307',      3, 'THEORY'),
  ('OE309',      'Fundamental of Genomics',                                      'OE309',      3, 'THEORY'),
  ('EM401',      'Employability Skills -VI',                                     'ES VI',      1, 'SKILL'),
  ('PC401',      'Proficiency and Co-Curricular Activities-VII',                 'DECCA VII',  2, 'SKILL'),
  ('CP402',      'Network Security & Cryptography Fundamentals (NSCF)',          'NSCF',       3, 'THEORY'),
  ('CP405',      'Operating Systems',                                            'OS',         3, 'THEORY'),
  ('CP401',      'Asynchronous Transfer Mode',                                   'ATM',        3, 'THEORY'),
  ('CP407',      'Intro to Data Mining & Warehousing',                           'DMW',        3, 'THEORY'),
  ('CP423',      'Computer Vision',                                              'CV',         3, 'THEORY'),
  ('CP425',      'Computer Vision Lab',                                          'CV Lab',     2, 'LAB'),
  ('CP499',      'Network Security & Cryptography Fundamentals Lab',             'NSCF Lab',   1, 'LAB'),
  ('CP455',      'Operating System Lab',                                         'OS Lab',     1, 'LAB'),
  ('PE403',      'Major Project Stage-I',                                        'MP Lab',     1, 'LAB'),
  ('PT403',      'Industrial Training Seminar',                                  'ITS Lab',    1, 'LAB'),
  ('UC451',      'Field Project/Field Visit-7',                                  'Field Visit',1, 'LAB'),
  ('CP413',      'Digital Image Processing',                                     'DIP',        2, 'THEORY'),
  ('SODECA-XI',  'Social Outreach, Discipline & Extra Curricular Activities-XI','SODECA XI', 2, 'LAB'),
  ('CSY001',     'Software Project Management',                                  'SPM',        3, 'THEORY'),
  ('CSY101',     'Natural Language Processing',                                  'NLP',        3, 'THEORY'),
  ('CSY151',     'Natural Language Processing Lab',                              'NLP Lab',    2, 'LAB'),
  ('CSY002',     'Knowledge Management & Data Mining',                           'KMDM',       3, 'THEORY'),
  ('CSY051',     'Network Simulator Lab',                                        'NS Lab',     3, 'LAB'),
  ('CSY052',     'Industrial Training Seminar & Project',                        'ITS Lab',    4, 'LAB'),
  ('CSY053',     'Pre Dissertation',                                             'PD',         5, 'LAB'),
  ('CSY032',     'Web development and Designing',                                'WDD',        3, 'THEORY')
) AS v(code, name, shortname, credits, stype)
ON CONFLICT (subject_code) DO UPDATE SET
  subject_name = EXCLUDED.subject_name,
  subject_shortname = EXCLUDED.subject_shortname,
  credits = EXCLUDED.credits,
  subject_type = EXCLUDED.subject_type,
  is_active = true,
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 3. LMS courses (unique normalized codes per tenant)
-- ---------------------------------------------------------------------------
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
codes AS (
  SELECT unnest(ARRAY[
    'SODECA-III','UC3002','EEPI','CS3001','CS3002','MA3004','CS3101','EC3001',
    'CS3052','CS3151','CS3004','EC3002','EM301','PC301','CP301','CP309','CP323',
    'CP325','CP302','CP352','CP353','CP397','CP399','PT303','UC351','CP319','CP359',
    'OE303','OE305','OE307','OE309','EM401','PC401','CP402','CP405','CP401','CP407',
    'CP423','CP425','CP499','CP455','PE403','PT403','UC451','CP413',
    'SODECA-XI','CSY001','CSY101','CSY151','CSY002','CSY051','CSY052','CSY053','CSY032'
  ]) AS code
)
INSERT INTO academic_courses (tenant_id, course_code, course_name, credits, is_elective, course_type)
SELECT t.tenant_id, s.subject_code, s.subject_name, s.credits, false, 'CORE'
FROM tenant t
CROSS JOIN codes c
JOIN academic_subjects s ON s.subject_code = c.code
ON CONFLICT (tenant_id, course_code) DO UPDATE SET
  course_name = EXCLUDED.course_name,
  credits = EXCLUDED.credits,
  course_type = 'CORE';

-- ---------------------------------------------------------------------------
-- 4. Replace 2026-2027 allocations with PDF-accurate mapping
-- ---------------------------------------------------------------------------
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
)
DELETE FROM academic_course_allocations a
USING tenant t
WHERE a.tenant_id = t.tenant_id
  AND a.academic_year = '2026-2027';

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
raw AS (
  SELECT * FROM (VALUES
    -- BTECH CSE III-A (12 slots)
    ('SODECA-III','BTECH CSE','III-A','naman.raj@mygyanvihar.com'),
    ('UC3002',    'BTECH CSE','III-A','bhanu.pratap@mygyanvihar.com'),
    ('EEPI',      'BTECH CSE','III-A','neha.ranga@mygyanvihar.com'),
    ('CS3001',    'BTECH CSE','III-A','samali.ghosh@mygyanvihar.com'),
    ('CS3002',    'BTECH CSE','III-A','priyanka1.gupta@mygyanvihar.com'),
    ('MA3004',    'BTECH CSE','III-A',NULL),
    ('CS3101',    'BTECH CSE','III-A','naman.raj@mygyanvihar.com'),
    ('EC3001',    'BTECH CSE','III-A','sandhya.sharma@mygyanvihar.com'),
    ('CS3052',    'BTECH CSE','III-A','samali.ghosh@mygyanvihar.com'),
    ('CS3151',    'BTECH CSE','III-A','naman.raj@mygyanvihar.com'),
    ('CS3004',    'BTECH CSE','III-A','himanshu.varshney@mygyanvihar.com'),
    ('EC3002',    'BTECH CSE','III-A','sandhya.sharma@mygyanvihar.com'),
    -- BTECH CSE III-B (12 slots)
    ('SODECA-III','BTECH CSE','III-B','neha.ranga@mygyanvihar.com'),
    ('UC3002',    'BTECH CSE','III-B','bhanu.pratap@mygyanvihar.com'),
    ('EEPI',      'BTECH CSE','III-B','neha.ranga@mygyanvihar.com'),
    ('CS3001',    'BTECH CSE','III-B','pooja.varshney@mygyanvihar.com'),
    ('CS3002',    'BTECH CSE','III-B',NULL),
    ('MA3004',    'BTECH CSE','III-B',NULL),
    ('CS3101',    'BTECH CSE','III-B','nasreen.praveen@mygyanvihar.com'),
    ('EC3001',    'BTECH CSE','III-B','sandhya.sharma@mygyanvihar.com'),
    ('CS3052',    'BTECH CSE','III-B','pooja.varshney@mygyanvihar.com'),
    ('CS3151',    'BTECH CSE','III-B','nasreen.praveen@mygyanvihar.com'),
    ('CS3004',    'BTECH CSE','III-B','himanshu.varshney@mygyanvihar.com'),
    ('EC3002',    'BTECH CSE','III-B','sandhya.sharma@mygyanvihar.com'),
    -- BTECH CSE V-A (19 slots)
    ('EM301',     'BTECH CSE','V-A','nasreen.praveen@mygyanvihar.com'),
    ('PC301',     'BTECH CSE','V-A','priyanka1.gupta@mygyanvihar.com'),
    ('CP301',     'BTECH CSE','V-A','samali.ghosh@mygyanvihar.com'),
    ('CP309',     'BTECH CSE','V-A','neha.ranga@mygyanvihar.com'),
    ('CP323',     'BTECH CSE','V-A','nasreen.praveen@mygyanvihar.com'),
    ('CP325',     'BTECH CSE','V-A','naman.raj@mygyanvihar.com'),
    ('CP302',     'BTECH CSE','V-A','rahul.kumar1@mygyanvihar.com'),
    ('CP352',     'BTECH CSE','V-A','rahul.kumar1@mygyanvihar.com'),
    ('CP353',     'BTECH CSE','V-A','samali.ghosh@mygyanvihar.com'),
    ('CP397',     'BTECH CSE','V-A','nasreen.praveen@mygyanvihar.com'),
    ('CP399',     'BTECH CSE','V-A','naman.raj@mygyanvihar.com'),
    ('PT303',     'BTECH CSE','V-A','lubna.aggarwal@mygyanvihar.com'),
    ('UC351',     'BTECH CSE','V-A','naman.raj@mygyanvihar.com'),
    ('CP319',     'BTECH CSE','V-A','shambhawi.thakur@mygyanvihar.com'),
    ('CP359',     'BTECH CSE','V-A',NULL),
    ('OE303',     'BTECH CSE','V-A','rahul.kumar1@mygyanvihar.com'),
    ('OE305',     'BTECH CSE','V-A','rahul.kumar1@mygyanvihar.com'),
    ('OE307',     'BTECH CSE','V-A','rahul.kumar1@mygyanvihar.com'),
    ('OE309',     'BTECH CSE','V-A','rahul.kumar1@mygyanvihar.com'),
    -- BTECH CSE V-B (19 slots)
    ('EM301',     'BTECH CSE','V-B','nasreen.praveen@mygyanvihar.com'),
    ('PC301',     'BTECH CSE','V-B','nasreen.praveen@mygyanvihar.com'),
    ('CP301',     'BTECH CSE','V-B',NULL),
    ('CP309',     'BTECH CSE','V-B','neha.ranga@mygyanvihar.com'),
    ('CP323',     'BTECH CSE','V-B','nasreen.praveen@mygyanvihar.com'),
    ('CP325',     'BTECH CSE','V-B','naman.raj@mygyanvihar.com'),
    ('CP302',     'BTECH CSE','V-B','rahul.kumar1@mygyanvihar.com'),
    ('CP352',     'BTECH CSE','V-B','rahul.kumar1@mygyanvihar.com'),
    ('CP353',     'BTECH CSE','V-B',NULL),
    ('CP397',     'BTECH CSE','V-B','nasreen.praveen@mygyanvihar.com'),
    ('CP399',     'BTECH CSE','V-B','naman.raj@mygyanvihar.com'),
    ('PT303',     'BTECH CSE','V-B','lubna.aggarwal@mygyanvihar.com'),
    ('UC351',     'BTECH CSE','V-B','naman.raj@mygyanvihar.com'),
    ('CP319',     'BTECH CSE','V-B','shambhawi.thakur@mygyanvihar.com'),
    ('CP359',     'BTECH CSE','V-B',NULL),
    ('OE303',     'BTECH CSE','V-B','rahul.kumar1@mygyanvihar.com'),
    ('OE305',     'BTECH CSE','V-B','rahul.kumar1@mygyanvihar.com'),
    ('OE307',     'BTECH CSE','V-B','rahul.kumar1@mygyanvihar.com'),
    ('OE309',     'BTECH CSE','V-B','rahul.kumar1@mygyanvihar.com'),
    -- BTECH CSE VII-A (14 slots)
    ('EM401',     'BTECH CSE','VII-A','rahul.kumar1@mygyanvihar.com'),
    ('PC401',     'BTECH CSE','VII-A','rahul.kumar1@mygyanvihar.com'),
    ('CP402',     'BTECH CSE','VII-A','nasreen.praveen@mygyanvihar.com'),
    ('CP405',     'BTECH CSE','VII-A','priyanka1.gupta@mygyanvihar.com'),
    ('CP401',     'BTECH CSE','VII-A','bhanu.pratap@mygyanvihar.com'),
    ('CP407',     'BTECH CSE','VII-A','pooja.varshney@mygyanvihar.com'),
    ('CP423',     'BTECH CSE','VII-A','neha.ranga@mygyanvihar.com'),
    ('CP425',     'BTECH CSE','VII-A','neha.ranga@mygyanvihar.com'),
    ('CP499',     'BTECH CSE','VII-A','samali.ghosh@mygyanvihar.com'),
    ('CP455',     'BTECH CSE','VII-A','priyanka1.gupta@mygyanvihar.com'),
    ('PE403',     'BTECH CSE','VII-A','himanshu.varshney@mygyanvihar.com'),
    ('PT403',     'BTECH CSE','VII-A','lubna.aggarwal@mygyanvihar.com'),
    ('UC451',     'BTECH CSE','VII-A','naman.raj@mygyanvihar.com'),
    ('CP413',     'BTECH CSE','VII-A','bhanu.pratap@mygyanvihar.com'),
    -- BTECH CSE VII-B (14 slots)
    ('EM401',     'BTECH CSE','VII-B','rahul.kumar1@mygyanvihar.com'),
    ('PC401',     'BTECH CSE','VII-B','pooja.varshney@mygyanvihar.com'),
    ('CP402',     'BTECH CSE','VII-B',NULL),
    ('CP405',     'BTECH CSE','VII-B','priyanka1.gupta@mygyanvihar.com'),
    ('CP401',     'BTECH CSE','VII-B','bhanu.pratap@mygyanvihar.com'),
    ('CP407',     'BTECH CSE','VII-B','pooja.varshney@mygyanvihar.com'),
    ('CP423',     'BTECH CSE','VII-B','neha.ranga@mygyanvihar.com'),
    ('CP425',     'BTECH CSE','VII-B','neha.ranga@mygyanvihar.com'),
    ('CP499',     'BTECH CSE','VII-B',NULL),
    ('CP455',     'BTECH CSE','VII-B','rahul.kumar1@mygyanvihar.com'),
    ('PE403',     'BTECH CSE','VII-B','shambhawi.thakur@mygyanvihar.com'),
    ('PT403',     'BTECH CSE','VII-B','lubna.aggarwal@mygyanvihar.com'),
    ('UC451',     'BTECH CSE','VII-B','naman.raj@mygyanvihar.com'),
    ('CP413',     'BTECH CSE','VII-B','bhanu.pratap@mygyanvihar.com'),
    -- MTECH CSE III (9 slots)
    ('SODECA-XI', 'MTECH CSE','III','priyanka1.gupta@mygyanvihar.com'),
    ('CSY001',    'MTECH CSE','III','samali.ghosh@mygyanvihar.com'),
    ('CSY101',    'MTECH CSE','III','lubna.aggarwal@mygyanvihar.com'),
    ('CSY151',    'MTECH CSE','III','lubna.aggarwal@mygyanvihar.com'),
    ('CSY002',    'MTECH CSE','III','neha.ranga@mygyanvihar.com'),
    ('CSY051',    'MTECH CSE','III','neha.ranga@mygyanvihar.com'),
    ('CSY052',    'MTECH CSE','III','priyanka1.gupta@mygyanvihar.com'),
    ('CSY053',    'MTECH CSE','III','priyanka1.gupta@mygyanvihar.com'),
    ('CSY032',    'MTECH CSE','III','shambhawi.thakur@mygyanvihar.com'),
    -- MTECH AIML III (9 slots — same faculty mapping per PDF)
    ('SODECA-XI', 'MTECH AIML','III','priyanka1.gupta@mygyanvihar.com'),
    ('CSY001',    'MTECH AIML','III','samali.ghosh@mygyanvihar.com'),
    ('CSY101',    'MTECH AIML','III','lubna.aggarwal@mygyanvihar.com'),
    ('CSY151',    'MTECH AIML','III','lubna.aggarwal@mygyanvihar.com'),
    ('CSY002',    'MTECH AIML','III','neha.ranga@mygyanvihar.com'),
    ('CSY051',    'MTECH AIML','III','neha.ranga@mygyanvihar.com'),
    ('CSY052',    'MTECH AIML','III','priyanka1.gupta@mygyanvihar.com'),
    ('CSY053',    'MTECH AIML','III','priyanka1.gupta@mygyanvihar.com'),
    ('CSY032',    'MTECH AIML','III','shambhawi.thakur@mygyanvihar.com')
  ) AS v(subject_code, program_name, semester, faculty_email)
)
INSERT INTO academic_course_allocations (
  tenant_id, subject_id, program_name, semester, faculty_user_id, academic_year, course_id, status
)
SELECT
  t.tenant_id,
  s.subject_id,
  r.program_name,
  r.semester,
  u.user_id,
  '2026-2027',
  c.course_id,
  'ACTIVE'
FROM raw r
JOIN academic_subjects s ON s.subject_code = r.subject_code
JOIN academic_courses c ON c.course_code = s.subject_code
LEFT JOIN users u ON r.faculty_email IS NOT NULL AND lower(u.official_email) = lower(r.faculty_email)
CROSS JOIN tenant t
ON CONFLICT (tenant_id, subject_id, program_name, semester, academic_year) DO UPDATE SET
  faculty_user_id = EXCLUDED.faculty_user_id,
  course_id = EXCLUDED.course_id,
  status = 'ACTIVE',
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 5. Timetable slots — one canonical slot per course, faculty from allocation
-- ---------------------------------------------------------------------------
INSERT INTO academic_timetables (tenant_id, course_id, day_of_week, start_time, end_time, faculty_user_id)
SELECT DISTINCT ON (a.tenant_id, a.course_id)
  a.tenant_id,
  a.course_id,
  1,
  '09:00'::time,
  '10:00'::time,
  a.faculty_user_id
FROM academic_course_allocations a
JOIN public.tenants tn ON tn.tenant_id = a.tenant_id AND tn.subdomain = 'sgvu'
WHERE a.academic_year = '2026-2027'
  AND a.faculty_user_id IS NOT NULL
  AND a.course_id IS NOT NULL
ORDER BY a.tenant_id, a.course_id, a.updated_at DESC
ON CONFLICT (tenant_id, course_id, day_of_week, start_time, end_time)
WHERE deleted_at IS NULL
DO UPDATE SET faculty_user_id = EXCLUDED.faculty_user_id;

-- ---------------------------------------------------------------------------
-- 6. Smoke manifest
-- ---------------------------------------------------------------------------
INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'academics.aestr_workload',
  'Faculty / HOD',
  'naman.raj@mygyanvihar.com',
  'Course allocation & timetable',
  'Full AESTR CSE workload 2026-2027 (III-A/B, V-A/B, VII-A/B, MTECH CSE/AIML)',
  'Source: Work load AESTR (1).pdf — normalized codes, 108 unique section slots, 12 faculty personas'
)
ON CONFLICT (smoke_key) DO UPDATE SET
  sample_record = EXCLUDED.sample_record,
  notes = EXCLUDED.notes,
  seeded_at = NOW();

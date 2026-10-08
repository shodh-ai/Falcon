-- BPT Physiotherapy timetable + workload seed (Sem III / V Batch A)
-- Source: PHYSIOTHERAPY DEPT DATA new.xlsx (batch A + faculty sheets RG/PB/AS)
-- Faculty scope: Riya Gupta, Prachi Baheti, Ajit Surana (+ HOD Gaurav Agarwal)

-- ---------------------------------------------------------------------------
-- 1. HOD hierarchy
-- ---------------------------------------------------------------------------
UPDATE departments d
SET hod_user_id = u.user_id, updated_at = NOW()
FROM users u
WHERE d.dept_name = 'BPT'
  AND lower(u.official_email) = lower('gaurav.agarwal@mygyanvihar.com');

UPDATE users u
SET reporting_officer_id = hod.user_id, updated_at = NOW()
FROM users hod
WHERE lower(hod.official_email) = lower('gaurav.agarwal@mygyanvihar.com')
  AND lower(u.official_email) IN (
    'riya.gupta@mygyanvihar.com',
    'prachi.baheti@mygyanvihar.com',
    'ajit.surana@mygyanvihar.com'
  );

-- ---------------------------------------------------------------------------
-- 2. Ensure Batch A students exist (Excel emails)
-- ---------------------------------------------------------------------------
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
dept AS (
  SELECT dept_id FROM departments WHERE dept_name = 'BPT' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
seed_students AS (
  SELECT * FROM (VALUES
  ('a6b3b81f-3626-58b8-9012-6c482bc6a423'::uuid, 'Akansha 2550136', 'akansha.2550136@mygyanvihar.com', 3, 'A'),
  ('a0348723-69c9-53f2-aabb-6606e3191eee'::uuid, 'Chaya 2547767', 'chaya.2547767@mygyanvihar.com', 3, 'A'),
  ('5834a216-d828-50a0-97c9-84b4a27da422'::uuid, 'Anant 2547204', 'anant.2547204@mygyanvihar.com', 3, 'A'),
  ('b001fba7-1d51-5c99-8a6d-0c73bfa6e1b9'::uuid, 'Balveer 2550122', 'balveer.2550122@mygyanvihar.com', 3, 'A'),
  ('6df1447d-2709-56ed-bf04-c8ca4e747c3f'::uuid, 'Chandra 2548459', 'chandra.2548459@mygyanvihar.com', 3, 'A'),
  ('72a48d81-c6c4-5efa-9911-515e1c73f35e'::uuid, 'Harendra 2455633', 'harendra.2455633@mygyanvihar.com', 5, 'A'),
  ('d658b4e7-8ce8-5c57-9a6e-c6e875578b4f'::uuid, 'Anshu 2453216', 'anshu.2453216@mygyanvihar.com', 5, 'A'),
  ('8c1fd140-7b91-528e-bd92-81c152edefc7'::uuid, 'Akansha 2455506', 'akansha.2455506@mygyanvihar.com', 5, 'A'),
  ('fb5101bd-7fcc-5c5c-91c7-0dbaa877eb75'::uuid, 'Harsh 2451251', 'harsh.2451251@mygyanvihar.com', 5, 'A'),
  ('32c5a07f-113c-5057-a412-04d81803d835'::uuid, 'Mantu 2449522', 'mantu.2449522@mygyanvihar.com', 5, 'A')
  ) AS s(user_id, name, email, semester_num, section_code)
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, is_active, onboarding_status, onboarding_profile
)
SELECT
  s.user_id, t.tenant_id, s.name, s.email, r.role_id, d.dept_id,
  p.hash, true, 'ACTIVE', '{}'::jsonb
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
  ('akansha.2550136@mygyanvihar.com'),
  ('chaya.2547767@mygyanvihar.com'),
  ('anant.2547204@mygyanvihar.com'),
  ('balveer.2550122@mygyanvihar.com'),
  ('chandra.2548459@mygyanvihar.com'),
  ('harendra.2455633@mygyanvihar.com'),
  ('anshu.2453216@mygyanvihar.com'),
  ('akansha.2455506@mygyanvihar.com'),
  ('harsh.2451251@mygyanvihar.com'),
  ('mantu.2449522@mygyanvihar.com')
  ) AS v(email)
)
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

WITH seed_students AS (
  SELECT * FROM (VALUES
  ('a6b3b81f-3626-58b8-9012-6c482bc6a423'::uuid, 'Akansha 2550136', 'akansha.2550136@mygyanvihar.com', 3, 'A'),
  ('a0348723-69c9-53f2-aabb-6606e3191eee'::uuid, 'Chaya 2547767', 'chaya.2547767@mygyanvihar.com', 3, 'A'),
  ('5834a216-d828-50a0-97c9-84b4a27da422'::uuid, 'Anant 2547204', 'anant.2547204@mygyanvihar.com', 3, 'A'),
  ('b001fba7-1d51-5c99-8a6d-0c73bfa6e1b9'::uuid, 'Balveer 2550122', 'balveer.2550122@mygyanvihar.com', 3, 'A'),
  ('6df1447d-2709-56ed-bf04-c8ca4e747c3f'::uuid, 'Chandra 2548459', 'chandra.2548459@mygyanvihar.com', 3, 'A'),
  ('72a48d81-c6c4-5efa-9911-515e1c73f35e'::uuid, 'Harendra 2455633', 'harendra.2455633@mygyanvihar.com', 5, 'A'),
  ('d658b4e7-8ce8-5c57-9a6e-c6e875578b4f'::uuid, 'Anshu 2453216', 'anshu.2453216@mygyanvihar.com', 5, 'A'),
  ('8c1fd140-7b91-528e-bd92-81c152edefc7'::uuid, 'Akansha 2455506', 'akansha.2455506@mygyanvihar.com', 5, 'A'),
  ('fb5101bd-7fcc-5c5c-91c7-0dbaa877eb75'::uuid, 'Harsh 2451251', 'harsh.2451251@mygyanvihar.com', 5, 'A'),
  ('32c5a07f-113c-5057-a412-04d81803d835'::uuid, 'Mantu 2449522', 'mantu.2449522@mygyanvihar.com', 5, 'A')
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
  ('akansha.2550136@mygyanvihar.com', 3, 'A'),
  ('chaya.2547767@mygyanvihar.com', 3, 'A'),
  ('anant.2547204@mygyanvihar.com', 3, 'A'),
  ('balveer.2550122@mygyanvihar.com', 3, 'A'),
  ('chandra.2548459@mygyanvihar.com', 3, 'A'),
  ('harendra.2455633@mygyanvihar.com', 5, 'A'),
  ('anshu.2453216@mygyanvihar.com', 5, 'A'),
  ('akansha.2455506@mygyanvihar.com', 5, 'A'),
  ('harsh.2451251@mygyanvihar.com', 5, 'A'),
  ('mantu.2449522@mygyanvihar.com', 5, 'A')
) AS v(email, sem, section_code) ON lower(u.official_email) = lower(v.email)
JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = 'BPT'
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
  ('BPT3CASESE02', 'case seminar ( SS', 'BPT3CASE', 4, 'THEORY'),
  ('BPT3CASESE07', 'Case Seminar / Pharmacology -I', 'BPT3CASE', 4, 'THEORY'),
  ('BPT3CASESET', 'case seminar / Pathology Microbiology', 'BPT3CASE', 4, 'THEORY'),
  ('BPT3ELECTRP', 'Electrotherapy 1 (Lab)', 'BPT3ELEC', 2, 'LAB'),
  ('BPT3ELECTRT', 'Electrotherapy 1', 'BPT3ELEC', 4, 'THEORY'),
  ('BPT3EXERCI02', 'EXERCISE THERAPY 1 BATCH A 3RD SEM', 'BPT3EXER', 4, 'THEORY'),
  ('BPT3EXERCI03', 'EXERCISE THERAPY 1 BATCH B 3RD SEM', 'BPT3EXER', 4, 'THEORY'),
  ('BPT3EXERCIT', 'EXERCISE THERAPY 1', 'BPT3EXER', 4, 'THEORY'),
  ('BPT3PHARMAT', 'Pharmacology-I', 'BPT3PHAR', 4, 'THEORY'),
  ('BPT5CASESE02', 'CASE SEMINAR', 'BPT5CASE', 4, 'THEORY'),
  ('BPT5CASESE10', 'CASE SEMINAR /CBR', 'BPT5CASE', 4, 'THEORY'),
  ('BPT5CASESET', 'CASE SEMINAR /clinical surgery &obs Gyane', 'BPT5CASE', 4, 'THEORY'),
  ('BPT5CBRT', 'CBR', 'BPT5CBRT', 4, 'THEORY'),
  ('BPT5CLINIC02', 'clinical surgery &obs Gyane', 'BPT5CLIN', 4, 'THEORY'),
  ('BPT5CLINIC03', 'CLINICAL ORTHO BATCH A V SEM', 'BPT5CLIN', 4, 'THEORY'),
  ('BPT5CLINIC04', 'CLINICAL ORTHO BATCH B (V SEM)', 'BPT5CLIN', 4, 'THEORY'),
  ('BPT5CLINICT', 'CLINICAL ORTHO', 'BPT5CLIN', 4, 'THEORY'),
  ('BPT7PTINCAT', 'PT in Cardiotoracic & Respiratory Conditions 7TH SEM', 'BPT7PTIN', 4, 'THEORY'),
  ('BPT7PTINNEP', 'PT in Neurological Conditions-I 7TH SEM LAB', 'BPT7PTIN', 2, 'LAB'),
  ('BPT7PTINNET', 'PT in Neurological Conditions-I 7TH SEM', 'BPT7PTIN', 4, 'THEORY')
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
  WHERE subject_code IN ('BPT3CASESE02', 'BPT3CASESE07', 'BPT3CASESET', 'BPT3ELECTRP', 'BPT3ELECTRT', 'BPT3EXERCI02', 'BPT3EXERCI03', 'BPT3EXERCIT', 'BPT3PHARMAT', 'BPT5CASESE02', 'BPT5CASESE10', 'BPT5CASESET', 'BPT5CBRT', 'BPT5CLINIC02', 'BPT5CLINIC03', 'BPT5CLINIC04', 'BPT5CLINICT', 'BPT7PTINCAT', 'BPT7PTINNEP', 'BPT7PTINNET')
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
  ('BPT3EXERCIT', 'BPT', 'III-A', 'riya.gupta@mygyanvihar.com'),
  ('BPT3PHARMAT', 'BPT', 'III-A', 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT3CASESET', 'BPT', 'III-A', 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT3CASESE02', 'BPT', 'III-A', 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT3ELECTRT', 'BPT', 'III-A', 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT3CASESE07', 'BPT', 'III-A', 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT3ELECTRP', 'BPT', 'III-A', 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT5CBRT', 'BPT', 'V-A', 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT5CASESET', 'BPT', 'V-A', 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT5CASESE02', 'BPT', 'V-A', 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT5CLINICT', 'BPT', 'V-A', 'riya.gupta@mygyanvihar.com'),
  ('BPT5CASESE10', 'BPT', 'V-A', 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT5CLINIC02', 'BPT', 'V-A', 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT7PTINCAT', 'BPT', 'VII-A', 'prachi.baheti@mygyanvihar.com'),
  ('BPT7PTINNEP', 'BPT', 'VII-A', 'ajit.surana@mygyanvihar.com'),
  ('BPT7PTINNET', 'BPT', 'VII-A', 'ajit.surana@mygyanvihar.com')
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
  ('BPT3EXERCIT', 'III-A', 'BPT-LT-1', 'A', 1, '09:10'::time, '10:00'::time, 'riya.gupta@mygyanvihar.com'),
  ('BPT3PHARMAT', 'III-A', 'BPT-LT-1', 'A', 1, '10:00'::time, '10:50'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT3CASESET', 'III-A', 'BPT-LT-1', 'A', 1, '11:40'::time, '12:30'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT3CASESE02', 'III-A', 'BPT-LT-1', 'A', 1, '02:20'::time, '03:10'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT3EXERCIT', 'III-A', 'BPT-LT-1', 'A', 2, '09:10'::time, '10:00'::time, 'riya.gupta@mygyanvihar.com'),
  ('BPT3PHARMAT', 'III-A', 'BPT-LT-1', 'A', 2, '10:00'::time, '10:50'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT3CASESET', 'III-A', 'BPT-LT-1', 'A', 2, '11:40'::time, '12:30'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT3CASESE02', 'III-A', 'BPT-LT-1', 'A', 2, '02:20'::time, '03:10'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT3EXERCIT', 'III-A', 'BPT-LT-1', 'A', 3, '09:10'::time, '10:00'::time, 'riya.gupta@mygyanvihar.com'),
  ('BPT3PHARMAT', 'III-A', 'BPT-LT-1', 'A', 3, '10:00'::time, '10:50'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT3CASESET', 'III-A', 'BPT-LT-1', 'A', 3, '11:40'::time, '12:30'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT3CASESE02', 'III-A', 'BPT-LT-1', 'A', 3, '02:20'::time, '03:10'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT3ELECTRT', 'III-A', 'BPT-LT-1', 'A', 4, '09:10'::time, '10:00'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT3CASESE07', 'III-A', 'BPT-LT-1', 'A', 4, '10:00'::time, '10:50'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT3ELECTRP', 'III-A', 'BPT-LT-1', 'A', 4, '11:40'::time, '12:30'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT3ELECTRT', 'III-A', 'BPT-LT-1', 'A', 5, '09:10'::time, '10:00'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT3CASESE07', 'III-A', 'BPT-LT-1', 'A', 5, '10:00'::time, '10:50'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT3ELECTRP', 'III-A', 'BPT-LT-1', 'A', 5, '11:40'::time, '12:30'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT3ELECTRT', 'III-A', 'BPT-LT-1', 'A', 6, '09:10'::time, '10:00'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT3CASESE07', 'III-A', 'BPT-LT-1', 'A', 6, '10:00'::time, '10:50'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT3ELECTRP', 'III-A', 'BPT-LT-1', 'A', 6, '11:40'::time, '12:30'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT5CBRT', 'V-A', 'BPT-LT-2', 'A', 1, '09:10'::time, '10:00'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT5CASESET', 'V-A', 'BPT-LT-2', 'A', 1, '10:00'::time, '10:50'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT5CASESE02', 'V-A', 'BPT-LT-2', 'A', 1, '11:40'::time, '12:30'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT5CASESE02', 'V-A', 'BPT-LT-2', 'A', 1, '02:20'::time, '03:10'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT5CBRT', 'V-A', 'BPT-LT-2', 'A', 2, '09:10'::time, '10:00'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT5CASESET', 'V-A', 'BPT-LT-2', 'A', 2, '10:00'::time, '10:50'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT5CASESE02', 'V-A', 'BPT-LT-2', 'A', 2, '11:40'::time, '12:30'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT5CASESE02', 'V-A', 'BPT-LT-2', 'A', 2, '02:20'::time, '03:10'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT5CBRT', 'V-A', 'BPT-LT-2', 'A', 3, '09:10'::time, '10:00'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT5CASESET', 'V-A', 'BPT-LT-2', 'A', 3, '10:00'::time, '10:50'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT5CASESE02', 'V-A', 'BPT-LT-2', 'A', 3, '11:40'::time, '12:30'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT5CASESE02', 'V-A', 'BPT-LT-2', 'A', 3, '02:20'::time, '03:10'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT5CLINICT', 'V-A', 'BPT-LT-2', 'A', 4, '09:10'::time, '10:00'::time, 'riya.gupta@mygyanvihar.com'),
  ('BPT5CASESE10', 'V-A', 'BPT-LT-2', 'A', 4, '10:00'::time, '10:50'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT5CLINIC02', 'V-A', 'BPT-LT-2', 'A', 4, '11:40'::time, '12:30'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT5CLINICT', 'V-A', 'BPT-LT-2', 'A', 5, '09:10'::time, '10:00'::time, 'riya.gupta@mygyanvihar.com'),
  ('BPT5CASESE10', 'V-A', 'BPT-LT-2', 'A', 5, '10:00'::time, '10:50'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT5CLINIC02', 'V-A', 'BPT-LT-2', 'A', 5, '11:40'::time, '12:30'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT5CLINICT', 'V-A', 'BPT-LT-2', 'A', 6, '09:10'::time, '10:00'::time, 'riya.gupta@mygyanvihar.com'),
  ('BPT5CASESE10', 'V-A', 'BPT-LT-2', 'A', 6, '10:00'::time, '10:50'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT5CLINIC02', 'V-A', 'BPT-LT-2', 'A', 6, '11:40'::time, '12:30'::time, 'gaurav.agarwal@mygyanvihar.com'),
  ('BPT3EXERCI02', 'III-A', 'BPT-LT-1', 'A', 1, '09:10'::time, '10:00'::time, 'riya.gupta@mygyanvihar.com'),
  ('BPT3EXERCI03', 'III-A', 'BPT-LT-1', 'A', 1, '10:00'::time, '10:50'::time, 'riya.gupta@mygyanvihar.com'),
  ('BPT3EXERCI02', 'III-A', 'BPT-LT-1', 'A', 2, '09:10'::time, '10:00'::time, 'riya.gupta@mygyanvihar.com'),
  ('BPT3EXERCI03', 'III-A', 'BPT-LT-1', 'A', 2, '10:00'::time, '10:50'::time, 'riya.gupta@mygyanvihar.com'),
  ('BPT3EXERCI02', 'III-A', 'BPT-LT-1', 'A', 3, '09:10'::time, '10:00'::time, 'riya.gupta@mygyanvihar.com'),
  ('BPT3EXERCI03', 'III-A', 'BPT-LT-1', 'A', 3, '10:00'::time, '10:50'::time, 'riya.gupta@mygyanvihar.com'),
  ('BPT5CLINIC03', 'V-A', 'BPT-LT-1', 'A', 4, '09:10'::time, '10:00'::time, 'riya.gupta@mygyanvihar.com'),
  ('BPT5CLINIC04', 'V-A', 'BPT-LT-1', 'A', 4, '10:00'::time, '10:50'::time, 'riya.gupta@mygyanvihar.com'),
  ('BPT5CLINIC03', 'V-A', 'BPT-LT-1', 'A', 5, '09:10'::time, '10:00'::time, 'riya.gupta@mygyanvihar.com'),
  ('BPT5CLINIC04', 'V-A', 'BPT-LT-1', 'A', 5, '10:00'::time, '10:50'::time, 'riya.gupta@mygyanvihar.com'),
  ('BPT5CLINIC03', 'V-A', 'BPT-LT-1', 'A', 6, '09:10'::time, '10:00'::time, 'riya.gupta@mygyanvihar.com'),
  ('BPT5CLINIC04', 'V-A', 'BPT-LT-1', 'A', 6, '10:00'::time, '10:50'::time, 'riya.gupta@mygyanvihar.com'),
  ('BPT7PTINCAT', 'VII-A', 'BPT-LT-2', 'A', 1, '10:00'::time, '10:50'::time, 'prachi.baheti@mygyanvihar.com'),
  ('BPT7PTINCAT', 'VII-A', 'BPT-LT-2', 'A', 2, '10:00'::time, '10:50'::time, 'prachi.baheti@mygyanvihar.com'),
  ('BPT7PTINCAT', 'VII-A', 'BPT-LT-2', 'A', 3, '10:00'::time, '10:50'::time, 'prachi.baheti@mygyanvihar.com'),
  ('BPT7PTINCAT', 'VII-A', 'BPT-LT-2', 'A', 4, '10:00'::time, '10:50'::time, 'prachi.baheti@mygyanvihar.com'),
  ('BPT7PTINCAT', 'VII-A', 'BPT-LT-2', 'A', 5, '10:00'::time, '10:50'::time, 'prachi.baheti@mygyanvihar.com'),
  ('BPT7PTINNET', 'VII-A', 'BPT-LT-3', 'A', 1, '09:10'::time, '10:00'::time, 'ajit.surana@mygyanvihar.com'),
  ('BPT7PTINNET', 'VII-A', 'BPT-LT-3', 'A', 2, '09:10'::time, '10:00'::time, 'ajit.surana@mygyanvihar.com'),
  ('BPT7PTINNET', 'VII-A', 'BPT-LT-3', 'A', 3, '09:10'::time, '10:00'::time, 'ajit.surana@mygyanvihar.com'),
  ('BPT7PTINNET', 'VII-A', 'BPT-LT-3', 'A', 4, '09:10'::time, '10:00'::time, 'ajit.surana@mygyanvihar.com'),
  ('BPT7PTINNET', 'VII-A', 'BPT-LT-3', 'A', 5, '09:10'::time, '10:00'::time, 'ajit.surana@mygyanvihar.com'),
  ('BPT7PTINNEP', 'VII-A', 'BPT-LT-3', 'A', 6, '09:10'::time, '10:00'::time, 'ajit.surana@mygyanvihar.com')
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
  JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = 'BPT'
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
  WHERE a.academic_year = '2026-2027'
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
  (3, 'riya.gupta@mygyanvihar.com'),
  (5, 'riya.gupta@mygyanvihar.com')
  ) AS m(semester_num, mentor_email)
),
bpt_students AS (
  SELECT u.user_id, sp.current_semester
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = 'BPT'
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

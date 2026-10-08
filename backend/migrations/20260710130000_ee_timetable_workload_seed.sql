-- B.Tech EE timetable + workload seed (Sem III / V)
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
  ('a1000001-0000-4000-8000-000000000001'::uuid, 'Dr.Paresh jain', 'paresh.jain@mygyanvihar.com', 'Electrical Engg', 'HOD'),
  ('a1000002-0000-4000-8000-000000000002'::uuid, 'Dr. Ritu Jain', 'ritu.jain@mygyanvihar.com', 'Electrical Engg', 'Faculty'),
  ('495fd9ec-fe91-5dbd-8576-7d823488daa4'::uuid, 'Dr.Raj Kumar', 'raj.kumar@mygyanvihar.com', 'Electrical Engg', 'Faculty')
  ) AS s(user_id, name, email, dept_name, role_name)
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, is_active, onboarding_status, onboarding_profile
)
SELECT
  s.user_id, t.tenant_id, s.name, s.email, r.role_id, d.dept_id,
  p.hash, true, 'PENDING_PASSWORD_RESET', '{}'::jsonb
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
  ('a1000103-0000-4000-8000-000000000013'::uuid, 'ADITYA KUMAR SINGH', 'aditya21mailme@gmail.com', 'Electrical Engg', 'Student', 'EE5001', 5),
  ('a1000104-0000-4000-8000-000000000014'::uuid, 'ANKIT KUMAR', 'kumaranikit424@gmail.com', 'Electrical Engg', 'Student', 'EE5002', 5),
  ('a1000105-0000-4000-8000-000000000015'::uuid, 'Dhiraj kumar', 'kumardhiraj944229@gmail.com', 'Electrical Engg', 'Student', 'EE5003', 5),
  ('a1000106-0000-4000-8000-000000000016'::uuid, 'Krish Sharma', 'krishsharma0623@gmail.com', 'Electrical Engg', 'Student', 'EE5004', 5),
  ('a1000107-0000-4000-8000-000000000017'::uuid, 'Kundan Kumar', 'kundanku8544@gmail.com', 'Electrical Engg', 'Student', 'EE5005', 5),
  ('a1000101-0000-4000-8000-000000000011'::uuid, 'Prince Kumar', 'prince.2547711@mygyanvihar.com', 'Electrical Engg', 'Student', '2547711', 3),
  ('a1000102-0000-4000-8000-000000000012'::uuid, 'Arbaz khan', 'arbaz.2550453@mygyanvihar.com', 'Electrical Engg', 'Student', '2550453', 3)
  ) AS s(user_id, name, email, dept_name, role_name, enrollment_no, semester_num)
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, is_active, onboarding_status, onboarding_profile
)
SELECT
  s.user_id, t.tenant_id, s.name, s.email, r.role_id, d.dept_id,
  p.hash, true, 'PENDING_PASSWORD_RESET', '{}'::jsonb
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
  'a1000001-0000-4000-8000-000000000001'::uuid,
  'a1000002-0000-4000-8000-000000000002'::uuid,
  '495fd9ec-fe91-5dbd-8576-7d823488daa4'::uuid,
  'a1000101-0000-4000-8000-000000000011'::uuid,
  'a1000102-0000-4000-8000-000000000012'::uuid,
  'a1000103-0000-4000-8000-000000000013'::uuid,
  'a1000104-0000-4000-8000-000000000014'::uuid,
  'a1000105-0000-4000-8000-000000000015'::uuid,
  'a1000106-0000-4000-8000-000000000016'::uuid,
  'a1000107-0000-4000-8000-000000000017'::uuid
)
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

WITH seed_students AS (
  SELECT * FROM (VALUES
  ('a1000103-0000-4000-8000-000000000013'::uuid, 'ADITYA KUMAR SINGH', 'aditya21mailme@gmail.com', 'Electrical Engg', 'Student', 'EE5001', 5),
  ('a1000104-0000-4000-8000-000000000014'::uuid, 'ANKIT KUMAR', 'kumaranikit424@gmail.com', 'Electrical Engg', 'Student', 'EE5002', 5),
  ('a1000105-0000-4000-8000-000000000015'::uuid, 'Dhiraj kumar', 'kumardhiraj944229@gmail.com', 'Electrical Engg', 'Student', 'EE5003', 5),
  ('a1000106-0000-4000-8000-000000000016'::uuid, 'Krish Sharma', 'krishsharma0623@gmail.com', 'Electrical Engg', 'Student', 'EE5004', 5),
  ('a1000107-0000-4000-8000-000000000017'::uuid, 'Kundan Kumar', 'kundanku8544@gmail.com', 'Electrical Engg', 'Student', 'EE5005', 5),
  ('a1000101-0000-4000-8000-000000000011'::uuid, 'Prince Kumar', 'prince.2547711@mygyanvihar.com', 'Electrical Engg', 'Student', '2547711', 3),
  ('a1000102-0000-4000-8000-000000000012'::uuid, 'Arbaz khan', 'arbaz.2550453@mygyanvihar.com', 'Electrical Engg', 'Student', '2550453', 3)
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
  ('aditya21mailme@gmail.com', 5),
  ('kumaranikit424@gmail.com', 5),
  ('kumardhiraj944229@gmail.com', 5),
  ('krishsharma0623@gmail.com', 5),
  ('kundanku8544@gmail.com', 5),
  ('prince.2547711@mygyanvihar.com', 3),
  ('arbaz.2550453@mygyanvihar.com', 3)
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
  ('EE301P', 'Applied Electronics Lab', 'EE301P', 2, 'LAB'),
  ('EE301T', 'Applied Electronics', 'EE301T', 4, 'THEORY'),
  ('EE302T', 'Electrical Machines', 'EE302T', 4, 'THEORY'),
  ('EE303P', 'Electrical Machines I Lab', 'EE303P', 2, 'LAB'),
  ('EE303T', 'Electrical Machines I', 'EE303T', 4, 'THEORY'),
  ('EE304P', 'Electrical Circuit Design Lab', 'EE304P', 2, 'LAB'),
  ('EE304T', 'Electrical Circuit Analysis', 'EE304T', 3, 'THEORY'),
  ('EE305T', 'Economics for Engineers', 'EE305T', 2, 'THEORY'),
  ('EE306T', 'Professional Growth Program', 'EE306T', 2, 'THEORY'),
  ('EE501P', 'Microprocessor Lab', 'EE501P', 2, 'LAB'),
  ('EE501T', 'Microprocessor', 'EE501T', 4, 'THEORY'),
  ('EE502P', 'Control System Lab', 'EE502P', 2, 'LAB'),
  ('EE502T', 'Control System', 'EE502T', 4, 'THEORY'),
  ('EE503P', 'System Programming Lab', 'EE503P', 2, 'LAB'),
  ('EE504T', 'Microprocessor Applications', 'EE504T', 3, 'THEORY'),
  ('EE505P', 'Power System I Lab', 'EE505P', 2, 'LAB'),
  ('EE505T', 'Power System I', 'EE505T', 4, 'THEORY'),
  ('EE506T', 'Renewable Energy Systems', 'EE506T', 3, 'THEORY'),
  ('EE507T', 'Electrical Engineering Class', 'EE507T', 2, 'THEORY'),
  ('EEWEEKAL', 'WEEKALY ACTIVITY', 'EEWEEKAL', 3, 'THEORY')
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
  WHERE subject_code IN ('EE301P', 'EE301T', 'EE302T', 'EE303P', 'EE303T', 'EE304P', 'EE304T', 'EE305T', 'EE306T', 'EE501P', 'EE501T', 'EE502P', 'EE502T', 'EE503P', 'EE504T', 'EE505P', 'EE505T', 'EE506T', 'EE507T', 'EEWEEKAL')
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
  ('EE304T', 'B.Tech EE', 'III', 'ritu.jain@mygyanvihar.com'),
  ('EE301T', 'B.Tech EE', 'III', 'raj.kumar@mygyanvihar.com'),
  ('EE301P', 'B.Tech EE', 'III', 'raj.kumar@mygyanvihar.com'),
  ('EE303T', 'B.Tech EE', 'III', 'raj.kumar@mygyanvihar.com'),
  ('EE305T', 'B.Tech EE', 'III', 'raj.kumar@mygyanvihar.com'),
  ('EE302T', 'B.Tech EE', 'III', 'raj.kumar@mygyanvihar.com'),
  ('EE306T', 'B.Tech EE', 'III', 'ritu.jain@mygyanvihar.com'),
  ('EE303P', 'B.Tech EE', 'III', 'raj.kumar@mygyanvihar.com'),
  ('EE304P', 'B.Tech EE', 'III', 'ritu.jain@mygyanvihar.com'),
  ('EE501T', 'B.Tech EE', 'V', 'ritu.jain@mygyanvihar.com'),
  ('EE502T', 'B.Tech EE', 'V', 'ritu.jain@mygyanvihar.com'),
  ('EE503P', 'B.Tech EE', 'V', 'ritu.jain@mygyanvihar.com'),
  ('EE507T', 'B.Tech EE', 'V', 'raj.kumar@mygyanvihar.com'),
  ('EE504T', 'B.Tech EE', 'V', 'ritu.jain@mygyanvihar.com'),
  ('EE505P', 'B.Tech EE', 'V', 'raj.kumar@mygyanvihar.com'),
  ('EE506T', 'B.Tech EE', 'V', 'raj.kumar@mygyanvihar.com'),
  ('EE502P', 'B.Tech EE', 'V', 'ritu.jain@mygyanvihar.com'),
  ('EEWEEKAL', 'B.Tech EE', 'V', 'ritu.jain@mygyanvihar.com'),
  ('EE505T', 'B.Tech EE', 'V', 'raj.kumar@mygyanvihar.com'),
  ('EE501P', 'B.Tech EE', 'V', 'ritu.jain@mygyanvihar.com')
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
  ('EE304T', 'III', 'MACHINE Lab EC Block', 1, '10:00'::time, '10:50'::time, 'ritu.jain@mygyanvihar.com'),
  ('EE301T', 'III', 'MACHINE Lab EC Block', 1, '10:55'::time, '11:45'::time, 'raj.kumar@mygyanvihar.com'),
  ('EE301P', 'III', 'MACHINE Lab EC Block', 1, '13:30'::time, '14:20'::time, 'raj.kumar@mygyanvihar.com'),
  ('EE303T', 'III', 'MACHINE Lab EC Block', 2, '09:10'::time, '10:00'::time, 'raj.kumar@mygyanvihar.com'),
  ('EE305T', 'III', 'MACHINE Lab EC Block', 2, '10:55'::time, '11:45'::time, 'raj.kumar@mygyanvihar.com'),
  ('EE302T', 'III', 'MACHINE Lab EC Block', 2, '11:45'::time, '12:35'::time, 'raj.kumar@mygyanvihar.com'),
  ('EE303T', 'III', 'MACHINE Lab EC Block', 3, '09:10'::time, '10:00'::time, 'raj.kumar@mygyanvihar.com'),
  ('EE306T', 'III', 'MACHINE Lab EC Block', 3, '10:55'::time, '11:45'::time, 'ritu.jain@mygyanvihar.com'),
  ('EE302T', 'III', 'MACHINE Lab EC Block', 3, '11:45'::time, '12:35'::time, 'raj.kumar@mygyanvihar.com'),
  ('EE301T', 'III', 'MACHINE Lab EC Block', 4, '09:10'::time, '10:00'::time, 'raj.kumar@mygyanvihar.com'),
  ('EE304T', 'III', 'MACHINE Lab EC Block', 4, '10:00'::time, '10:50'::time, 'ritu.jain@mygyanvihar.com'),
  ('EE302T', 'III', 'MACHINE Lab EC Block', 4, '10:55'::time, '11:45'::time, 'raj.kumar@mygyanvihar.com'),
  ('EE303P', 'III', 'MACHINE Lab EC Block', 4, '13:30'::time, '14:20'::time, 'raj.kumar@mygyanvihar.com'),
  ('EE301T', 'III', 'MACHINE Lab EC Block', 5, '09:10'::time, '10:00'::time, 'raj.kumar@mygyanvihar.com'),
  ('EE306T', 'III', 'MACHINE Lab EC Block', 5, '10:00'::time, '10:50'::time, 'ritu.jain@mygyanvihar.com'),
  ('EE305T', 'III', 'MACHINE Lab EC Block', 5, '11:45'::time, '12:35'::time, 'raj.kumar@mygyanvihar.com'),
  ('EE304P', 'III', 'MACHINE Lab EC Block', 5, '13:30'::time, '14:20'::time, 'ritu.jain@mygyanvihar.com'),
  ('EE304T', 'III', 'MACHINE Lab EC Block', 6, '09:10'::time, '10:00'::time, 'ritu.jain@mygyanvihar.com'),
  ('EE306T', 'III', 'MACHINE Lab EC Block', 6, '10:00'::time, '10:50'::time, 'ritu.jain@mygyanvihar.com'),
  ('EE501T', 'V', 'LT-18', 1, '10:00'::time, '10:50'::time, 'ritu.jain@mygyanvihar.com'),
  ('EE502T', 'V', 'LT-18', 1, '10:55'::time, '11:45'::time, 'ritu.jain@mygyanvihar.com'),
  ('EE502T', 'V', 'LT-18', 1, '11:45'::time, '12:35'::time, 'ritu.jain@mygyanvihar.com'),
  ('EE503P', 'V', 'LT-18', 1, '13:30'::time, '14:20'::time, 'ritu.jain@mygyanvihar.com'),
  ('EE507T', 'V', 'LT-18', 2, '09:10'::time, '10:00'::time, 'raj.kumar@mygyanvihar.com'),
  ('EE504T', 'V', 'LT-18', 2, '10:55'::time, '11:45'::time, 'ritu.jain@mygyanvihar.com'),
  ('EE505P', 'V', 'LT-18', 2, '13:30'::time, '14:20'::time, 'raj.kumar@mygyanvihar.com'),
  ('EE502T', 'V', 'LT-18', 2, '15:10'::time, '16:00'::time, 'ritu.jain@mygyanvihar.com'),
  ('EE507T', 'V', 'LT-18', 3, '09:10'::time, '10:00'::time, 'raj.kumar@mygyanvihar.com'),
  ('EE506T', 'V', 'LT-18', 3, '10:55'::time, '11:45'::time, 'raj.kumar@mygyanvihar.com'),
  ('EE502P', 'V', 'LT-18', 3, '13:30'::time, '14:20'::time, 'ritu.jain@mygyanvihar.com'),
  ('EEWEEKAL', 'V', 'LT-18', 3, '15:10'::time, '16:00'::time, 'ritu.jain@mygyanvihar.com'),
  ('EE505T', 'V', 'LT-18', 4, '09:10'::time, '10:00'::time, 'raj.kumar@mygyanvihar.com'),
  ('EE501T', 'V', 'LT-18', 4, '10:00'::time, '10:50'::time, 'ritu.jain@mygyanvihar.com'),
  ('EE504T', 'V', 'LT-18', 4, '11:45'::time, '12:35'::time, 'ritu.jain@mygyanvihar.com'),
  ('EE501P', 'V', 'LT-18', 4, '13:30'::time, '14:20'::time, 'ritu.jain@mygyanvihar.com'),
  ('EE505T', 'V', 'LT-18', 5, '09:10'::time, '10:00'::time, 'raj.kumar@mygyanvihar.com'),
  ('EE501T', 'V', 'LT-18', 5, '10:00'::time, '10:50'::time, 'ritu.jain@mygyanvihar.com'),
  ('EE506T', 'V', 'LT-18', 5, '10:55'::time, '11:45'::time, 'raj.kumar@mygyanvihar.com'),
  ('EE504T', 'V', 'LT-18', 5, '11:45'::time, '12:35'::time, 'ritu.jain@mygyanvihar.com'),
  ('EE505T', 'V', 'LT-18', 6, '09:10'::time, '10:00'::time, 'raj.kumar@mygyanvihar.com'),
  ('EE506T', 'V', 'LT-18', 6, '10:00'::time, '10:50'::time, 'raj.kumar@mygyanvihar.com')
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
  WHERE a.academic_year = '2026-2027'
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
  (3, 'raj.kumar@mygyanvihar.com'),
  (5, 'ritu.jain@mygyanvihar.com')
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

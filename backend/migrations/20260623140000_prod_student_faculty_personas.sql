-- Prod-ready personas: 5 students + 5 faculty (password: password123)
-- Tenant: sgvu | Dept: Computer Science
--
-- STUDENTS (user_id → email → enrollment_no)
--   f1000001-0000-4000-8000-000000000001 → student3@mygyanvihar.com → SGVU-2026-2001
--   f1000002-0000-4000-8000-000000000002 → student4@mygyanvihar.com → SGVU-2026-2002
--   f1000003-0000-4000-8000-000000000003 → student5@mygyanvihar.com → SGVU-2026-2003
--   f1000004-0000-4000-8000-000000000004 → student6@mygyanvihar.com → SGVU-2026-2004
--   f1000005-0000-4000-8000-000000000005 → student7@mygyanvihar.com → SGVU-2026-2005
--
-- FACULTY (user_id → email → employee_id)
--   f2000001-0000-4000-8000-000000000001 → faculty2@mygyanvihar.com → SGVU-FAC-002
--   f2000002-0000-4000-8000-000000000002 → faculty3@mygyanvihar.com → SGVU-FAC-003
--   f2000003-0000-4000-8000-000000000003 → faculty4@mygyanvihar.com → SGVU-FAC-004
--   f2000004-0000-4000-8000-000000000004 → faculty5@mygyanvihar.com → SGVU-FAC-005
--   f2000005-0000-4000-8000-000000000005 → faculty6@mygyanvihar.com → SGVU-FAC-006

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
-- Students
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
    ('f1000001-0000-4000-8000-000000000001'::uuid, 'Student Three', 'student3@mygyanvihar.com'),
    ('f1000002-0000-4000-8000-000000000002'::uuid, 'Student Four',  'student4@mygyanvihar.com'),
    ('f1000003-0000-4000-8000-000000000003'::uuid, 'Student Five',  'student5@mygyanvihar.com'),
    ('f1000004-0000-4000-8000-000000000004'::uuid, 'Student Six',   'student6@mygyanvihar.com'),
    ('f1000005-0000-4000-8000-000000000005'::uuid, 'Student Seven', 'student7@mygyanvihar.com')
  ) AS s(user_id, name, email)
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, is_active, onboarding_status
)
SELECT
  ss.user_id,
  t.tenant_id,
  ss.name,
  ss.email,
  r.role_id,
  d.dept_id,
  p.hash,
  true,
  'COMPLETED'
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
  onboarding_status = 'COMPLETED';

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u
WHERE lower(u.official_email) IN (
  'student3@mygyanvihar.com',
  'student4@mygyanvihar.com',
  'student5@mygyanvihar.com',
  'student6@mygyanvihar.com',
  'student7@mygyanvihar.com'
)
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

INSERT INTO student_profiles (
  tenant_id, user_id, enrollment_no, enrollment_number, admission_number,
  batch, gender, date_of_birth, nationality, admission_status, status, phone
)
SELECT
  u.tenant_id,
  u.user_id,
  data.enrollment_no,
  data.enrollment_no,
  data.admission_no,
  '2025-29',
  data.gender,
  data.dob::date,
  'Indian',
  'ACTIVE',
  'ACTIVE',
  data.phone
FROM users u
JOIN (VALUES
  ('student3@mygyanvihar.com', 'SGVU-2026-2001', 'ADM-2025-CSE-2001', 'Male',   '2004-03-12', '+91-9876502001'),
  ('student4@mygyanvihar.com', 'SGVU-2026-2002', 'ADM-2025-CSE-2002', 'Female', '2004-07-22', '+91-9876502002'),
  ('student5@mygyanvihar.com', 'SGVU-2026-2003', 'ADM-2025-CSE-2003', 'Male',   '2004-11-05', '+91-9876502003'),
  ('student6@mygyanvihar.com', 'SGVU-2026-2004', 'ADM-2025-CSE-2004', 'Female', '2005-01-18', '+91-9876502004'),
  ('student7@mygyanvihar.com', 'SGVU-2026-2005', 'ADM-2025-CSE-2005', 'Male',   '2005-05-30', '+91-9876502005')
) AS data(email, enrollment_no, admission_no, gender, dob, phone)
  ON lower(u.official_email) = lower(data.email)
ON CONFLICT (user_id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  enrollment_no = EXCLUDED.enrollment_no,
  enrollment_number = EXCLUDED.enrollment_number,
  admission_number = EXCLUDED.admission_number,
  batch = EXCLUDED.batch,
  gender = EXCLUDED.gender,
  date_of_birth = EXCLUDED.date_of_birth,
  nationality = EXCLUDED.nationality,
  admission_status = EXCLUDED.admission_status,
  status = EXCLUDED.status,
  phone = EXCLUDED.phone,
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Faculty
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
    ('f2000001-0000-4000-8000-000000000001'::uuid, 'Faculty Two',   'faculty2@mygyanvihar.com', 65000.00),
    ('f2000002-0000-4000-8000-000000000002'::uuid, 'Faculty Three', 'faculty3@mygyanvihar.com', 68000.00),
    ('f2000003-0000-4000-8000-000000000003'::uuid, 'Faculty Four',  'faculty4@mygyanvihar.com', 72000.00),
    ('f2000004-0000-4000-8000-000000000004'::uuid, 'Faculty Five',  'faculty5@mygyanvihar.com', 70000.00),
    ('f2000005-0000-4000-8000-000000000005'::uuid, 'Faculty Six',   'faculty6@mygyanvihar.com', 66000.00)
  ) AS f(user_id, name, email, salary_base)
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, salary_base, reporting_officer_id, is_active, onboarding_status
)
SELECT
  sf.user_id,
  t.tenant_id,
  sf.name,
  sf.email,
  r.role_id,
  d.dept_id,
  p.hash,
  sf.salary_base,
  hod.user_id,
  true,
  'COMPLETED'
FROM seed_faculty sf
CROSS JOIN tenant t
CROSS JOIN pwd p
CROSS JOIN dept d
CROSS JOIN hod
JOIN roles r ON r.role_name = 'Faculty'
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  dept_id = EXCLUDED.dept_id,
  password_hash = EXCLUDED.password_hash,
  salary_base = EXCLUDED.salary_base,
  reporting_officer_id = EXCLUDED.reporting_officer_id,
  is_active = true,
  onboarding_status = 'COMPLETED';

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u
WHERE lower(u.official_email) IN (
  'faculty2@mygyanvihar.com',
  'faculty3@mygyanvihar.com',
  'faculty4@mygyanvihar.com',
  'faculty5@mygyanvihar.com',
  'faculty6@mygyanvihar.com'
)
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

WITH ctx AS (
  SELECT
    t.tenant_id,
    oe.entity_id,
    (SELECT shift_id FROM hr_shifts WHERE shift_name = 'Faculty 9-4' AND entity_id = oe.entity_id LIMIT 1) AS faculty_shift
  FROM public.tenants t
  JOIN org_entities oe ON oe.tenant_id = t.tenant_id AND oe.entity_code = 'SGVU_UNIVERSITY'
  WHERE t.subdomain = 'sgvu'
  LIMIT 1
),
staff AS (
  SELECT
    u.user_id,
    u.tenant_id,
    data.designation,
    data.employee_id,
    data.joining_date::date AS joining_date,
    ctx.faculty_shift AS shift_id,
    ctx.entity_id
  FROM users u
  CROSS JOIN ctx
  JOIN (VALUES
    ('faculty2@mygyanvihar.com', 'Assistant Professor',  'SGVU-FAC-002', (CURRENT_DATE - 820)::text),
    ('faculty3@mygyanvihar.com', 'Assistant Professor',  'SGVU-FAC-003', (CURRENT_DATE - 640)::text),
    ('faculty4@mygyanvihar.com', 'Associate Professor',  'SGVU-FAC-004', (CURRENT_DATE - 1100)::text),
    ('faculty5@mygyanvihar.com', 'Assistant Professor',  'SGVU-FAC-005', (CURRENT_DATE - 480)::text),
    ('faculty6@mygyanvihar.com', 'Senior Faculty',       'SGVU-FAC-006', (CURRENT_DATE - 1350)::text)
  ) AS data(email, designation, employee_id, joining_date)
    ON lower(u.official_email) = lower(data.email)
)
INSERT INTO hr_employee_profiles (
  tenant_id, user_id, employee_id, designation, joining_date, entity_id, shift_id, week_off_day
)
SELECT s.tenant_id, s.user_id, s.employee_id, s.designation, s.joining_date, s.entity_id, s.shift_id, 0
FROM staff s
ON CONFLICT (tenant_id, user_id) DO UPDATE SET
  employee_id = EXCLUDED.employee_id,
  designation = EXCLUDED.designation,
  joining_date = EXCLUDED.joining_date,
  entity_id = EXCLUDED.entity_id,
  shift_id = COALESCE(EXCLUDED.shift_id, hr_employee_profiles.shift_id);

UPDATE users u
SET entity_id = hep.entity_id, updated_at = NOW()
FROM hr_employee_profiles hep
WHERE u.user_id = hep.user_id
  AND lower(u.official_email) IN (
    'faculty2@mygyanvihar.com',
    'faculty3@mygyanvihar.com',
    'faculty4@mygyanvihar.com',
    'faculty5@mygyanvihar.com',
    'faculty6@mygyanvihar.com'
  )
  AND hep.entity_id IS NOT NULL
  AND u.entity_id IS DISTINCT FROM hep.entity_id;

INSERT INTO user_entity_access (user_id, entity_id)
SELECT ep.user_id, ep.entity_id
FROM hr_employee_profiles ep
JOIN users u ON u.user_id = ep.user_id
WHERE lower(u.official_email) IN (
  'faculty2@mygyanvihar.com',
  'faculty3@mygyanvihar.com',
  'faculty4@mygyanvihar.com',
  'faculty5@mygyanvihar.com',
  'faculty6@mygyanvihar.com'
)
AND ep.entity_id IS NOT NULL
ON CONFLICT (user_id, entity_id) DO NOTHING;

INSERT INTO hr_leave_balances (user_id, leave_type, year, entitled, used)
SELECT u.user_id, lb.leave_type, 2026, lb.entitled, lb.used
FROM users u
CROSS JOIN (VALUES
  ('CL', 12.00, 0.00),
  ('SL', 10.00, 0.00),
  ('EL', 18.00, 0.00)
) AS lb(leave_type, entitled, used)
WHERE lower(u.official_email) IN (
  'faculty2@mygyanvihar.com',
  'faculty3@mygyanvihar.com',
  'faculty4@mygyanvihar.com',
  'faculty5@mygyanvihar.com',
  'faculty6@mygyanvihar.com'
)
ON CONFLICT (user_id, leave_type, year) DO UPDATE SET
  entitled = EXCLUDED.entitled,
  used = EXCLUDED.used;

-- Mentorship: one student per new faculty
INSERT INTO academic_mentorships (student_user_id, proctor_user_id, is_active)
SELECT s.user_id, f.user_id, true
FROM (VALUES
  ('student3@mygyanvihar.com', 'faculty2@mygyanvihar.com'),
  ('student4@mygyanvihar.com', 'faculty3@mygyanvihar.com'),
  ('student5@mygyanvihar.com', 'faculty4@mygyanvihar.com'),
  ('student6@mygyanvihar.com', 'faculty5@mygyanvihar.com'),
  ('student7@mygyanvihar.com', 'faculty6@mygyanvihar.com')
) AS data(student_email, faculty_email)
JOIN users s ON lower(s.official_email) = lower(data.student_email)
JOIN users f ON lower(f.official_email) = lower(data.faculty_email)
ON CONFLICT (student_user_id) DO UPDATE SET
  proctor_user_id = EXCLUDED.proctor_user_id,
  is_active = true;

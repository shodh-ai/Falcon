-- Production-safe HOD persona: Sohit — Head of Department, Computer Science.
-- Login: sohit@mygyanvihar.com / password123
-- Tenant: sgvu | Role: HOD | Dept: Computer Science

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE role_name = 'HOD') THEN
    INSERT INTO roles (role_name, description)
    VALUES ('HOD', 'Application role for Head of Department portal access');
  END IF;
END $$;

INSERT INTO departments (dept_name, description)
VALUES ('Computer Science', 'School of Computing & IT')
ON CONFLICT (dept_name) DO NOTHING;

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
dept AS (
  SELECT dept_id FROM departments WHERE dept_name = 'Computer Science' LIMIT 1
),
president AS (
  SELECT user_id FROM users WHERE lower(official_email) = 'president@mygyanvihar.com' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
sohit_id AS (
  SELECT COALESCE(
    (SELECT user_id FROM users WHERE lower(official_email) = 'sohit@mygyanvihar.com' LIMIT 1),
    'f300000b-0000-4000-8000-00000000000b'::uuid
  ) AS user_id
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, salary_base, reporting_officer_id, is_active,
  onboarding_status, onboarding_profile
)
SELECT
  s.user_id,
  t.tenant_id,
  'Sohit',
  'sohit@mygyanvihar.com',
  r.role_id,
  d.dept_id,
  p.hash,
  95000.00,
  president.user_id,
  true,
  'ACTIVE',
  '{}'::jsonb
FROM tenant t
CROSS JOIN pwd p
CROSS JOIN dept d
CROSS JOIN sohit_id s
LEFT JOIN president ON true
JOIN roles r ON r.role_name = 'HOD'
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  dept_id = EXCLUDED.dept_id,
  password_hash = EXCLUDED.password_hash,
  salary_base = COALESCE(EXCLUDED.salary_base, users.salary_base),
  reporting_officer_id = COALESCE(EXCLUDED.reporting_officer_id, users.reporting_officer_id),
  is_active = true,
  onboarding_status = 'ACTIVE',
  onboarding_profile = '{}'::jsonb;

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u
WHERE lower(u.official_email) = 'sohit@mygyanvihar.com'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

UPDATE departments d
SET hod_user_id = u.user_id
FROM users u
WHERE d.dept_name = 'Computer Science'
  AND lower(u.official_email) = 'sohit@mygyanvihar.com';

UPDATE users u
SET reporting_officer_id = d.hod_user_id,
    updated_at = NOW()
FROM departments d
WHERE u.dept_id = d.dept_id
  AND d.dept_name = 'Computer Science'
  AND d.hod_user_id IS NOT NULL
  AND u.user_id <> d.hod_user_id
  AND u.role_id IN (SELECT role_id FROM roles WHERE role_name = 'Faculty');

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
    'Head of Department — CSE'::varchar AS designation,
    'SGVU-HOD-SOHIT'::varchar AS employee_id,
    (CURRENT_DATE - 1200)::date AS joining_date,
    ctx.faculty_shift AS shift_id,
    ctx.entity_id
  FROM users u
  CROSS JOIN ctx
  WHERE lower(u.official_email) = 'sohit@mygyanvihar.com'
)
INSERT INTO hr_employee_profiles (
  tenant_id, user_id, employee_id, designation, joining_date, entity_id, shift_id, week_off_day
)
SELECT s.tenant_id, s.user_id, s.employee_id, s.designation, s.joining_date, s.entity_id, s.shift_id, 0
FROM staff s
WHERE to_regclass('public.hr_employee_profiles') IS NOT NULL
ON CONFLICT (tenant_id, user_id) DO UPDATE SET
  employee_id = EXCLUDED.employee_id,
  designation = EXCLUDED.designation,
  joining_date = EXCLUDED.joining_date,
  entity_id = COALESCE(EXCLUDED.entity_id, hr_employee_profiles.entity_id),
  shift_id = COALESCE(EXCLUDED.shift_id, hr_employee_profiles.shift_id);

UPDATE users u
SET entity_id = hep.entity_id, updated_at = NOW()
FROM hr_employee_profiles hep
WHERE u.user_id = hep.user_id
  AND lower(u.official_email) = 'sohit@mygyanvihar.com'
  AND hep.entity_id IS NOT NULL
  AND u.entity_id IS DISTINCT FROM hep.entity_id;

INSERT INTO user_entity_access (user_id, entity_id)
SELECT ep.user_id, ep.entity_id
FROM hr_employee_profiles ep
JOIN users u ON u.user_id = ep.user_id
WHERE lower(u.official_email) = 'sohit@mygyanvihar.com'
  AND ep.entity_id IS NOT NULL
  AND to_regclass('public.user_entity_access') IS NOT NULL
ON CONFLICT (user_id, entity_id) DO NOTHING;

INSERT INTO hr_leave_balances (user_id, leave_type, year, entitled, used)
SELECT u.user_id, lb.leave_type, 2026, lb.entitled, lb.used
FROM users u
CROSS JOIN (VALUES
  ('CL', 12.00, 0.00),
  ('SL', 10.00, 0.00),
  ('EL', 18.00, 0.00)
) AS lb(leave_type, entitled, used)
WHERE lower(u.official_email) = 'sohit@mygyanvihar.com'
  AND to_regclass('public.hr_leave_balances') IS NOT NULL
ON CONFLICT (user_id, leave_type, year) DO UPDATE SET
  entitled = EXCLUDED.entitled,
  used = EXCLUDED.used;

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'auth.sohit-hod-cse',
  'HOD',
  'sohit@mygyanvihar.com',
  'HOD portal & CSE department head',
  'Sohit — Head of Department, Computer Science',
  'Password: password123. Sets departments.hod_user_id for CSE and faculty reporting lines.'
)
ON CONFLICT (smoke_key) DO UPDATE SET
  role_email = EXCLUDED.role_email,
  sample_record = EXCLUDED.sample_record,
  notes = EXCLUDED.notes,
  seeded_at = NOW();

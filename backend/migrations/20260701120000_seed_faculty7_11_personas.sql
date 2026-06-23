-- Five additional faculty personas for SGVU prod/demo
-- Default password: password123 → first login runs staff onboarding wizard
--
-- FACULTY (user_id → email → employee_id)
--   f2000006-0000-4000-8000-000000000006 → faculty7@mygyanvihar.com  → SGVU-FAC-007
--   f2000007-0000-4000-8000-000000000007 → faculty8@mygyanvihar.com  → SGVU-FAC-008
--   f2000008-0000-4000-8000-000000000008 → faculty9@mygyanvihar.com  → SGVU-FAC-009
--   f2000009-0000-4000-8000-000000000009 → faculty10@mygyanvihar.com → SGVU-FAC-010
--   f200000a-0000-4000-8000-00000000000a → faculty11@mygyanvihar.com → SGVU-FAC-011

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE role_name = 'Faculty') THEN
    INSERT INTO roles (role_name, description)
    VALUES ('Faculty', 'Application role for Faculty portal access');
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
hod AS (
  SELECT user_id FROM users WHERE official_email = 'hod@mygyanvihar.com' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
seed_faculty AS (
  SELECT * FROM (VALUES
    ('f2000006-0000-4000-8000-000000000006'::uuid, 'Faculty Seven',   'faculty7@mygyanvihar.com',  67000.00),
    ('f2000007-0000-4000-8000-000000000007'::uuid, 'Faculty Eight',   'faculty8@mygyanvihar.com',  69000.00),
    ('f2000008-0000-4000-8000-000000000008'::uuid, 'Faculty Nine',    'faculty9@mygyanvihar.com',  71000.00),
    ('f2000009-0000-4000-8000-000000000009'::uuid, 'Faculty Ten',     'faculty10@mygyanvihar.com', 64000.00),
    ('f200000a-0000-4000-8000-00000000000a'::uuid, 'Faculty Eleven',  'faculty11@mygyanvihar.com', 73000.00)
  ) AS f(user_id, name, email, salary_base)
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, salary_base, reporting_officer_id, is_active, onboarding_status, onboarding_profile
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
  'PENDING_PASSWORD_RESET',
  '{}'::jsonb
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
  salary_base = EXCLUDED.salary_base,
  reporting_officer_id = EXCLUDED.reporting_officer_id,
  is_active = true,
  onboarding_status = 'PENDING_PASSWORD_RESET',
  onboarding_profile = '{}'::jsonb;

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u
WHERE lower(u.official_email) IN (
  'faculty7@mygyanvihar.com',
  'faculty8@mygyanvihar.com',
  'faculty9@mygyanvihar.com',
  'faculty10@mygyanvihar.com',
  'faculty11@mygyanvihar.com'
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
    ('faculty7@mygyanvihar.com',  'Assistant Professor',  'SGVU-FAC-007', (CURRENT_DATE - 560)::text),
    ('faculty8@mygyanvihar.com',  'Assistant Professor',  'SGVU-FAC-008', (CURRENT_DATE - 720)::text),
    ('faculty9@mygyanvihar.com',  'Associate Professor',  'SGVU-FAC-009', (CURRENT_DATE - 980)::text),
    ('faculty10@mygyanvihar.com', 'Assistant Professor',  'SGVU-FAC-010', (CURRENT_DATE - 390)::text),
    ('faculty11@mygyanvihar.com', 'Senior Faculty',       'SGVU-FAC-011', (CURRENT_DATE - 1200)::text)
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
    'faculty7@mygyanvihar.com',
    'faculty8@mygyanvihar.com',
    'faculty9@mygyanvihar.com',
    'faculty10@mygyanvihar.com',
    'faculty11@mygyanvihar.com'
  )
  AND hep.entity_id IS NOT NULL
  AND u.entity_id IS DISTINCT FROM hep.entity_id;

INSERT INTO user_entity_access (user_id, entity_id)
SELECT ep.user_id, ep.entity_id
FROM hr_employee_profiles ep
JOIN users u ON u.user_id = ep.user_id
WHERE lower(u.official_email) IN (
  'faculty7@mygyanvihar.com',
  'faculty8@mygyanvihar.com',
  'faculty9@mygyanvihar.com',
  'faculty10@mygyanvihar.com',
  'faculty11@mygyanvihar.com'
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
  'faculty7@mygyanvihar.com',
  'faculty8@mygyanvihar.com',
  'faculty9@mygyanvihar.com',
  'faculty10@mygyanvihar.com',
  'faculty11@mygyanvihar.com'
)
ON CONFLICT (user_id, leave_type, year) DO UPDATE SET
  entitled = EXCLUDED.entitled,
  used = EXCLUDED.used;

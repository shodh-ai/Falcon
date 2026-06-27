-- Production-safe faculty persona: Pooja Varshney (AESTR workload faculty).
-- Login: pooja.varshney@mygyanvihar.com / password123
-- Tenant: sgvu | Role: Faculty | Dept: Computer Science

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
  SELECT user_id FROM users WHERE lower(official_email) = 'hod@mygyanvihar.com' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, salary_base, reporting_officer_id, is_active,
  onboarding_status, onboarding_profile
)
SELECT
  'f3000004-0000-4000-8000-000000000004'::uuid,
  t.tenant_id,
  'Pooja Varshney',
  'pooja.varshney@mygyanvihar.com',
  r.role_id,
  d.dept_id,
  p.hash,
  68000.00,
  hod.user_id,
  true,
  'ACTIVE',
  '{}'::jsonb
FROM tenant t
CROSS JOIN pwd p
CROSS JOIN dept d
LEFT JOIN hod ON true
JOIN roles r ON r.role_name = 'Faculty'
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
WHERE lower(u.official_email) = 'pooja.varshney@mygyanvihar.com'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

-- HR profile + entity access (matches other faculty QA personas).
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
    'Assistant Professor'::varchar AS designation,
    'SGVU-FAC-012'::varchar AS employee_id,
    (CURRENT_DATE - 900)::date AS joining_date,
    ctx.faculty_shift AS shift_id,
    ctx.entity_id
  FROM users u
  CROSS JOIN ctx
  WHERE lower(u.official_email) = 'pooja.varshney@mygyanvihar.com'
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
  AND lower(u.official_email) = 'pooja.varshney@mygyanvihar.com'
  AND hep.entity_id IS NOT NULL
  AND u.entity_id IS DISTINCT FROM hep.entity_id;

INSERT INTO user_entity_access (user_id, entity_id)
SELECT ep.user_id, ep.entity_id
FROM hr_employee_profiles ep
JOIN users u ON u.user_id = ep.user_id
WHERE lower(u.official_email) = 'pooja.varshney@mygyanvihar.com'
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
WHERE lower(u.official_email) = 'pooja.varshney@mygyanvihar.com'
  AND to_regclass('public.hr_leave_balances') IS NOT NULL
ON CONFLICT (user_id, leave_type, year) DO UPDATE SET
  entitled = EXCLUDED.entitled,
  used = EXCLUDED.used;

-- AESTR 2026-2027 teaching load (idempotent).
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
faculty AS (
  SELECT user_id FROM users WHERE lower(official_email) = 'pooja.varshney@mygyanvihar.com' LIMIT 1
),
raw AS (
  SELECT * FROM (VALUES
    ('CS3001', 'BTECH CSE', 'III-B'),
    ('CS3052', 'BTECH CSE', 'III-B'),
    ('CP407',  'BTECH CSE', 'VII-A'),
    ('PC401',  'BTECH CSE', 'VII-B'),
    ('CP407',  'BTECH CSE', 'VII-B')
  ) AS r(subject_code, program_name, semester)
)
INSERT INTO academic_course_allocations (
  tenant_id, subject_id, program_name, semester, faculty_user_id, academic_year, course_id, status
)
SELECT
  t.tenant_id,
  s.subject_id,
  r.program_name,
  r.semester,
  f.user_id,
  '2026-2027',
  c.course_id,
  'ACTIVE'
FROM raw r
JOIN academic_subjects s ON s.subject_code = r.subject_code
JOIN academic_courses c ON c.course_code = s.subject_code AND c.tenant_id = t.tenant_id
JOIN faculty f ON true
CROSS JOIN tenant t
WHERE f.user_id IS NOT NULL
  AND s.subject_id IS NOT NULL
  AND c.course_id IS NOT NULL
ON CONFLICT (tenant_id, subject_id, program_name, semester, academic_year) DO UPDATE SET
  faculty_user_id = EXCLUDED.faculty_user_id,
  course_id = EXCLUDED.course_id,
  status = 'ACTIVE',
  updated_at = NOW();

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'auth.pooja-varshney-faculty',
  'Faculty',
  'pooja.varshney@mygyanvihar.com',
  'Local login & AESTR teaching load',
  'Pooja Varshney — CS3001/CS3052 (III-B), CP407/PC401 (VII-A/B)',
  'Password: password123. Faculty portal + course allocations for production QA.'
)
ON CONFLICT (smoke_key) DO UPDATE SET
  role_email = EXCLUDED.role_email,
  sample_record = EXCLUDED.sample_record,
  notes = EXCLUDED.notes,
  seeded_at = NOW();

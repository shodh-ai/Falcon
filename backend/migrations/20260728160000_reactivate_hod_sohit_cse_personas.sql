-- Re-enable CSE HOD test personas for QA smoke testing.
-- Login: hod@mygyanvihar.com / password123
-- Login: sohit@mygyanvihar.com / password123

INSERT INTO departments (dept_name, description)
VALUES ('Computer Science', 'School of Computing & IT')
ON CONFLICT (dept_name) DO NOTHING;

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
dept AS (
  SELECT dept_id FROM departments WHERE dept_name = 'Computer Science' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
hod_role AS (
  SELECT role_id FROM roles WHERE role_name = 'HOD' LIMIT 1
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, salary_base, is_active, onboarding_status, onboarding_profile
)
SELECT
  'b0000004-0000-4000-8000-000000000004'::uuid,
  t.tenant_id,
  'HOD CSE',
  'hod@mygyanvihar.com',
  r.role_id,
  d.dept_id,
  p.hash,
  95000.00,
  true,
  'ACTIVE',
  '{}'::jsonb
FROM tenant t
CROSS JOIN pwd p
CROSS JOIN dept d
CROSS JOIN hod_role r
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  dept_id = EXCLUDED.dept_id,
  password_hash = EXCLUDED.password_hash,
  is_active = true,
  onboarding_status = 'ACTIVE',
  onboarding_profile = '{}'::jsonb,
  updated_at = NOW();

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
dept AS (
  SELECT dept_id FROM departments WHERE dept_name = 'Computer Science' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
hod_role AS (
  SELECT role_id FROM roles WHERE role_name = 'HOD' LIMIT 1
),
president AS (
  SELECT user_id FROM users WHERE lower(official_email) = 'president@mygyanvihar.com' LIMIT 1
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, salary_base, reporting_officer_id, is_active,
  onboarding_status, onboarding_profile
)
SELECT
  COALESCE(
    (SELECT user_id FROM users WHERE lower(official_email) = 'sohit@mygyanvihar.com' LIMIT 1),
    'f300000b-0000-4000-8000-00000000000b'::uuid
  ),
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
CROSS JOIN hod_role r
LEFT JOIN president ON true
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  dept_id = EXCLUDED.dept_id,
  password_hash = EXCLUDED.password_hash,
  reporting_officer_id = COALESCE(EXCLUDED.reporting_officer_id, users.reporting_officer_id),
  is_active = true,
  onboarding_status = 'ACTIVE',
  onboarding_profile = '{}'::jsonb,
  updated_at = NOW();

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u
JOIN roles r ON r.role_id = u.role_id AND r.role_name = 'HOD'
WHERE lower(u.official_email) IN ('hod@mygyanvihar.com', 'sohit@mygyanvihar.com')
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

-- Canonical CSE department head for scoped APIs: prefer Sohit; hod@ retains HOD portal via dept_id.
UPDATE departments d
SET hod_user_id = u.user_id, updated_at = NOW()
FROM users u
WHERE d.dept_name = 'Computer Science'
  AND lower(u.official_email) = 'sohit@mygyanvihar.com';

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'auth.reactivate-hod-sohit-cse',
  'hod',
  'hod@mygyanvihar.com',
  'CSE HOD smoke personas',
  'hod@ + sohit@ active',
  'Both CSE HOD test accounts re-enabled. Password: password123'
)
ON CONFLICT (smoke_key) DO UPDATE SET
  role_email = EXCLUDED.role_email,
  sample_record = EXCLUDED.sample_record,
  notes = EXCLUDED.notes,
  seeded_at = NOW();

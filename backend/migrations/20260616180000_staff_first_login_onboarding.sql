-- Faculty/HOD first-login onboarding documents + demo accounts

CREATE TABLE IF NOT EXISTS staff_onboarding_docs (
  doc_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  staff_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  doc_type VARCHAR(50) NOT NULL CHECK (doc_type IN ('AADHAAR', 'PAN', 'HIGHEST_DEGREE', 'PHOTO')),
  file_path TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  admin_remarks TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_user_id, doc_type)
);

CREATE INDEX IF NOT EXISTS idx_staff_onboarding_docs_staff
  ON staff_onboarding_docs (staff_user_id, status);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
staff AS (
  SELECT * FROM (VALUES
    ('faculty.onboarding.demo@mygyanvihar.com', 'Faculty Onboarding Demo', 'Faculty'),
    ('hod.onboarding.demo@mygyanvihar.com', 'HOD Onboarding Demo', 'HOD')
  ) AS s(email, name, role_name)
)
UPDATE users u
SET
  password_hash = pwd.hash,
  onboarding_status = 'PENDING_PASSWORD_RESET',
  onboarding_profile = '{}'::jsonb,
  is_active = true,
  role_id = r.role_id
FROM staff s, tenant t, pwd, roles r
WHERE u.tenant_id = t.tenant_id
  AND lower(u.official_email) = lower(s.email)
  AND r.role_name = s.role_name;

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
dept AS (
  SELECT dept_id FROM departments WHERE dept_name = 'Computer Science' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
staff AS (
  SELECT * FROM (VALUES
    ('d2000001-0000-4000-8000-000000000001'::uuid, 'faculty.onboarding.demo@mygyanvihar.com', 'Faculty Onboarding Demo', 'Faculty'),
    ('d2000002-0000-4000-8000-000000000002'::uuid, 'hod.onboarding.demo@mygyanvihar.com', 'HOD Onboarding Demo', 'HOD')
  ) AS s(user_id, email, name, role_name)
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, is_active, onboarding_status, onboarding_profile
)
SELECT
  s.user_id,
  t.tenant_id,
  s.name,
  s.email,
  r.role_id,
  d.dept_id,
  pwd.hash,
  true,
  'PENDING_PASSWORD_RESET',
  '{}'::jsonb
FROM staff s
CROSS JOIN tenant t
CROSS JOIN pwd
JOIN roles r ON r.role_name = s.role_name
LEFT JOIN dept d ON true
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  onboarding_status = 'PENDING_PASSWORD_RESET',
  onboarding_profile = '{}'::jsonb,
  is_active = true;

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u
WHERE lower(u.official_email) IN (
  'faculty.onboarding.demo@mygyanvihar.com',
  'hod.onboarding.demo@mygyanvihar.com'
)
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

INSERT INTO hr_employee_profiles (tenant_id, user_id, employee_id, designation, joining_date, entity_id)
SELECT u.tenant_id, u.user_id,
  CASE
    WHEN lower(u.official_email) LIKE 'faculty.%' THEN 'SGVU-FAC-ONBOARD-001'
    ELSE 'SGVU-HOD-ONBOARD-001'
  END,
  CASE
    WHEN lower(u.official_email) LIKE 'faculty.%' THEN 'Assistant Professor'
    ELSE 'Head of Department'
  END,
  CURRENT_DATE,
  COALESCE(u.entity_id, (SELECT entity_id FROM org_entities WHERE tenant_id = u.tenant_id AND is_active = true LIMIT 1))
FROM users u
WHERE lower(u.official_email) IN (
  'faculty.onboarding.demo@mygyanvihar.com',
  'hod.onboarding.demo@mygyanvihar.com'
)
ON CONFLICT (tenant_id, user_id) DO NOTHING;

UPDATE users u
SET entity_id = p.entity_id
FROM hr_employee_profiles p
WHERE p.user_id = u.user_id AND p.tenant_id = u.tenant_id
  AND p.entity_id IS NOT NULL
  AND u.entity_id IS NULL
  AND lower(u.official_email) IN (
    'faculty.onboarding.demo@mygyanvihar.com',
    'hod.onboarding.demo@mygyanvihar.com'
  );

INSERT INTO user_entity_access (user_id, entity_id)
SELECT p.user_id, p.entity_id
FROM hr_employee_profiles p
JOIN users u ON u.user_id = p.user_id
WHERE p.entity_id IS NOT NULL
  AND lower(u.official_email) IN (
    'faculty.onboarding.demo@mygyanvihar.com',
    'hod.onboarding.demo@mygyanvihar.com'
  )
ON CONFLICT (user_id, entity_id) DO NOTHING;

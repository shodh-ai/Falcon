-- Incubation Admin QA persona for /incubation workspace (password: password123)

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
incubation_role AS (
  SELECT role_id FROM roles WHERE role_name = 'Incubation_Admin' LIMIT 1
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id,
  password_hash, salary_base, onboarding_status, is_active
)
SELECT
  'b000000e-0000-4000-8000-00000000000e'::uuid,
  t.tenant_id,
  'Incubation Cell Admin',
  'incubation@mygyanvihar.com',
  ir.role_id,
  p.hash,
  82000.00,
  'ACTIVE',
  true
FROM tenant t, pwd p, incubation_role ir
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  password_hash = EXCLUDED.password_hash,
  onboarding_status = EXCLUDED.onboarding_status,
  is_active = true;

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
incubation_role AS (
  SELECT role_id FROM roles WHERE role_name = 'Incubation_Admin' LIMIT 1
)
INSERT INTO users (
  tenant_id, name, official_email, role_id, google_id,
  password_hash, onboarding_status, is_active
)
SELECT
  t.tenant_id,
  'Dev Incubation Admin',
  'dev.incubation@mygyanvihar.com',
  ir.role_id,
  'dev-incubation',
  p.hash,
  'ACTIVE',
  true
FROM tenant t, pwd p, incubation_role ir
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  google_id = EXCLUDED.google_id,
  password_hash = EXCLUDED.password_hash,
  onboarding_status = EXCLUDED.onboarding_status,
  is_active = true;

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u
JOIN public.tenants t ON t.tenant_id = u.tenant_id AND t.subdomain = 'sgvu'
WHERE lower(u.official_email) IN (
  'incubation@mygyanvihar.com',
  'dev.incubation@mygyanvihar.com'
)
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

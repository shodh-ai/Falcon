-- Master Super Admin account for Entity Management Hub (password: password123)

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
super_role AS (SELECT role_id FROM roles WHERE role_name = 'SuperAdmin' LIMIT 1),
dept AS (SELECT dept_id FROM departments WHERE dept_name = 'Computer Science' LIMIT 1)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, is_active
)
SELECT
  'b000000c-0000-4000-8000-00000000000c'::uuid,
  t.tenant_id,
  'Super Admin',
  'superadmin@mygyanvihar.com',
  sr.role_id,
  d.dept_id,
  p.hash,
  true
FROM tenant t, pwd p, super_role sr, dept d
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  password_hash = EXCLUDED.password_hash,
  is_active = true;

-- Ensure user_roles mapping for JWT role claims
WITH super_user AS (
  SELECT user_id FROM users WHERE lower(official_email) = 'superadmin@mygyanvihar.com' LIMIT 1
),
super_role AS (SELECT role_id FROM roles WHERE role_name = 'SuperAdmin' LIMIT 1)
INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT su.user_id, sr.role_id, true
FROM super_user su, super_role sr
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = true;

-- Grant access to all tenant entities
INSERT INTO user_entity_access (user_id, entity_id)
SELECT u.user_id, oe.entity_id
FROM users u
CROSS JOIN org_entities oe
WHERE lower(u.official_email) = 'superadmin@mygyanvihar.com'
  AND u.tenant_id = oe.tenant_id
  AND oe.is_active = true
ON CONFLICT (user_id, entity_id) DO NOTHING;

-- Also give dev.superadmin a password for local login fallback
UPDATE users
SET password_hash = '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'
WHERE lower(official_email) = 'dev.superadmin@mygyanvihar.com'
  AND password_hash IS NULL;

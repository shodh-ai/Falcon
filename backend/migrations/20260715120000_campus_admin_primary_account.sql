-- Primary Campus Admin account; retire legacy Super Admin / Admissions Officer logins.

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
campus_role AS (SELECT role_id FROM roles WHERE role_name = 'CampusAdmin' LIMIT 1),
dept AS (SELECT dept_id FROM departments WHERE dept_name = 'Computer Science' LIMIT 1)
INSERT INTO users (
  tenant_id, name, official_email, role_id, dept_id, password_hash, is_active, deleted_at
)
SELECT
  t.tenant_id,
  'Campus Admin',
  'campusadmin@mygyanvihar.com',
  cr.role_id,
  d.dept_id,
  p.hash,
  true,
  NULL
FROM tenant t, pwd p, campus_role cr, dept d
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  dept_id = EXCLUDED.dept_id,
  password_hash = EXCLUDED.password_hash,
  is_active = true,
  deleted_at = NULL;

WITH campus_user AS (
  SELECT user_id FROM users WHERE lower(official_email) = 'campusadmin@mygyanvihar.com' LIMIT 1
),
campus_role AS (SELECT role_id FROM roles WHERE role_name = 'CampusAdmin' LIMIT 1)
INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT cu.user_id, cr.role_id, true
FROM campus_user cu, campus_role cr
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = true;

DELETE FROM user_roles ur
USING users u, roles r
WHERE ur.user_id = u.user_id
  AND ur.role_id = r.role_id
  AND lower(u.official_email) = 'campusadmin@mygyanvihar.com'
  AND r.role_name IN ('SuperAdmin', 'AdmissionsOfficer');

INSERT INTO user_entity_access (user_id, entity_id)
SELECT u.user_id, oe.entity_id
FROM users u
CROSS JOIN org_entities oe
WHERE lower(u.official_email) = 'campusadmin@mygyanvihar.com'
  AND u.tenant_id = oe.tenant_id
  AND oe.is_active = true
ON CONFLICT (user_id, entity_id) DO NOTHING;

UPDATE users
SET is_active = false,
    deleted_at = COALESCE(deleted_at, NOW())
WHERE lower(official_email) IN (
  'superadmin@mygyanvihar.com',
  'dev.superadmin@mygyanvihar.com',
  'dev.admissionsofficer@mygyanvihar.com'
);

DELETE FROM user_roles ur
USING users u
WHERE ur.user_id = u.user_id
  AND lower(u.official_email) IN (
    'superadmin@mygyanvihar.com',
    'dev.superadmin@mygyanvihar.com',
    'dev.admissionsofficer@mygyanvihar.com'
  );

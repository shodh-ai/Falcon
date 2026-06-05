-- Two distinct HR personas: one Master HR Admin + one regular HR staff member.

INSERT INTO roles (role_name, description)
VALUES ('HRAdmin', 'Master HR administrator with full HRMS access and permissions matrix control')
ON CONFLICT DO NOTHING;

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
dept AS (
  SELECT dept_id FROM departments WHERE dept_name = 'Computer Science' LIMIT 1
),
admin_role AS (SELECT role_id FROM roles WHERE role_name = 'HRAdmin' LIMIT 1),
staff_role AS (SELECT role_id FROM roles WHERE role_name = 'HR' LIMIT 1)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, salary_base, reporting_officer_id, is_active
)
SELECT
  'b000000b-0000-4000-8000-00000000000b'::uuid,
  t.tenant_id,
  'HR Admin',
  'hr.admin@mygyanvihar.com',
  ar.role_id,
  d.dept_id,
  p.hash,
  95000.00,
  NULL::uuid,
  true
FROM tenant t, pwd p, dept d, admin_role ar
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  password_hash = EXCLUDED.password_hash,
  is_active = true;

-- Existing hr@ account becomes regular HR staff (not master admin).
UPDATE users
SET name = 'HR Staff', role_id = (SELECT role_id FROM roles WHERE role_name = 'HR' LIMIT 1)
WHERE lower(official_email) = 'hr@mygyanvihar.com';

-- Granular permissions for regular HR staff only.
WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
staff AS (SELECT user_id FROM users WHERE lower(official_email) = 'hr@mygyanvihar.com' LIMIT 1)
INSERT INTO hr_permissions (tenant_id, user_id, capabilities)
SELECT t.tenant_id, s.user_id, jsonb_build_object(
  'onboarding', 'read',
  'offboarding', 'read',
  'payroll', 'none',
  'biometrics', 'read',
  'leaves', 'write',
  'documents', 'read',
  'policies', 'read',
  'rules', 'none',
  'directory', 'read',
  'attendance', 'write'
)
FROM tenant t, staff s
ON CONFLICT (tenant_id, user_id) DO UPDATE SET capabilities = EXCLUDED.capabilities;

-- HR Admin employee profile for directory/biometric linkage.
WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
ent AS (SELECT entity_id FROM org_entities WHERE entity_code = 'SGVU_UNIVERSITY' LIMIT 1),
admin AS (SELECT user_id FROM users WHERE lower(official_email) = 'hr.admin@mygyanvihar.com' LIMIT 1)
INSERT INTO hr_employee_profiles (tenant_id, user_id, employee_id, designation, joining_date, entity_id)
SELECT t.tenant_id, a.user_id, 'SGVU-HR-ADMIN', 'Master HR Administrator', CURRENT_DATE, e.entity_id
FROM tenant t, ent e, admin a
ON CONFLICT (tenant_id, user_id) DO UPDATE SET
  designation = EXCLUDED.designation,
  entity_id = EXCLUDED.entity_id;

-- Reactivate Super Admin + Admissions Officer QA/production personas.
-- Prior migration 20260715120000 retired these logins in favor of CampusAdmin;
-- full ERP E2E and platform ops require the dedicated personas again.
-- Password: password123

WITH pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
targets AS (
  SELECT * FROM (VALUES
    ('superadmin@mygyanvihar.com', 'Super Admin', 'SuperAdmin'),
    ('dev.superadmin@mygyanvihar.com', 'Dev Super Admin', 'SuperAdmin'),
    ('dev.admissionsofficer@mygyanvihar.com', 'Dev Admissions Officer', 'AdmissionsOfficer')
  ) AS t(email, display_name, role_name)
)
UPDATE users u
SET
  name = t.display_name,
  role_id = r.role_id,
  password_hash = p.hash,
  is_active = true,
  deleted_at = NULL,
  updated_at = NOW()
FROM targets t
JOIN roles r ON r.role_name = t.role_name
CROSS JOIN pwd p
WHERE lower(u.official_email) = lower(t.email);

-- Ensure JWT role claims (primary)
INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, r.role_id, true
FROM users u
JOIN roles r ON (
  (lower(u.official_email) IN ('superadmin@mygyanvihar.com', 'dev.superadmin@mygyanvihar.com') AND r.role_name = 'SuperAdmin')
  OR (lower(u.official_email) = 'dev.admissionsofficer@mygyanvihar.com' AND r.role_name = 'AdmissionsOfficer')
)
WHERE lower(u.official_email) IN (
  'superadmin@mygyanvihar.com',
  'dev.superadmin@mygyanvihar.com',
  'dev.admissionsofficer@mygyanvihar.com'
)
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = true;

-- Drop CampusAdmin primary claim on these dedicated personas so JWT role is correct
UPDATE user_roles ur
SET is_primary = false
FROM users u, roles r
WHERE ur.user_id = u.user_id
  AND ur.role_id = r.role_id
  AND r.role_name = 'CampusAdmin'
  AND lower(u.official_email) IN (
    'superadmin@mygyanvihar.com',
    'dev.superadmin@mygyanvihar.com',
    'dev.admissionsofficer@mygyanvihar.com'
  );

-- Entity access for Super Admins (all active tenant entities)
INSERT INTO user_entity_access (user_id, entity_id)
SELECT u.user_id, oe.entity_id
FROM users u
JOIN org_entities oe ON oe.tenant_id = u.tenant_id AND oe.is_active = true
WHERE lower(u.official_email) IN (
  'superadmin@mygyanvihar.com',
  'dev.superadmin@mygyanvihar.com'
)
ON CONFLICT (user_id, entity_id) DO NOTHING;

INSERT INTO system_audit_logs (table_name, record_id, action, new_value, changed_by_user_id)
SELECT
  'users',
  u.user_id,
  'REACTIVATE_PERSONA',
  jsonb_build_object(
    'email', u.official_email,
    'role', r.role_name,
    'reason', 'ERP production readiness — restore SuperAdmin/AdmissionsOfficer local logins'
  ),
  u.user_id
FROM users u
JOIN roles r ON r.role_id = u.role_id
WHERE lower(u.official_email) IN (
  'superadmin@mygyanvihar.com',
  'dev.superadmin@mygyanvihar.com',
  'dev.admissionsofficer@mygyanvihar.com'
);

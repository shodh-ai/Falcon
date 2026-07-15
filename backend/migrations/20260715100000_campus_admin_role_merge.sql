-- Merge Super Admin + Admissions Officer into Campus Admin.

INSERT INTO roles (role_name, description)
VALUES (
  'CampusAdmin',
  'Campus Administrator — platform governance, hierarchy, and admissions operations'
)
ON CONFLICT (role_name) DO UPDATE
SET description = EXCLUDED.description;

-- Primary role on users
UPDATE users u
SET role_id = ca.role_id
FROM roles ca
WHERE ca.role_name = 'CampusAdmin'
  AND u.role_id IN (
    SELECT role_id FROM roles
    WHERE role_name IN ('SuperAdmin', 'AdmissionsOfficer')
  );

-- JWT role claims
INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT ur.user_id, ca.role_id, ur.is_primary
FROM user_roles ur
INNER JOIN roles legacy ON legacy.role_id = ur.role_id
CROSS JOIN roles ca
WHERE legacy.role_name IN ('SuperAdmin', 'AdmissionsOfficer')
  AND ca.role_name = 'CampusAdmin'
ON CONFLICT (user_id, role_id) DO UPDATE
SET is_primary = user_roles.is_primary OR EXCLUDED.is_primary;

-- Demote legacy-only mappings when CampusAdmin is now primary
UPDATE user_roles ur
SET is_primary = false
FROM roles legacy
WHERE ur.role_id = legacy.role_id
  AND legacy.role_name IN ('SuperAdmin', 'AdmissionsOfficer')
  AND EXISTS (
    SELECT 1
    FROM user_roles ca_ur
    INNER JOIN roles ca ON ca.role_id = ca_ur.role_id
    WHERE ca.role_name = 'CampusAdmin'
      AND ca_ur.user_id = ur.user_id
      AND ca_ur.is_primary = true
  );

-- Grant secondary Dean role to every HOD user (campus policy: HODs also hold Dean hat).
-- Enables Faculty + HOD + Dean workspace switcher for all department heads.

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT ur.user_id, rd.role_id, false
FROM user_roles ur
INNER JOIN roles rh ON rh.role_id = ur.role_id AND rh.role_name = 'HOD'
CROSS JOIN roles rd
WHERE rd.role_name = 'Dean'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Users whose primary users.role_id is HOD but missing from user_roles Dean backfill edge case.
INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, rd.role_id, false
FROM users u
INNER JOIN roles rh ON rh.role_id = u.role_id AND rh.role_name = 'HOD'
CROSS JOIN roles rd
WHERE rd.role_name = 'Dean'
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = u.user_id
      AND ur.role_id = rd.role_id
  )
ON CONFLICT (user_id, role_id) DO NOTHING;

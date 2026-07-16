-- Restore HOD ↔ Faculty (and school Dean) workspace switcher on localhost/dev DBs.
-- Matches AuthService.syncMultiHatWorkspaceRoles() backfill.

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT ur.user_id, rf.role_id, false
FROM user_roles ur
INNER JOIN roles rh ON rh.role_id = ur.role_id AND rh.role_name = 'HOD'
CROSS JOIN roles rf
WHERE rf.role_name = 'Faculty'
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT s.dean_user_id, rd.role_id, false
FROM schools s
JOIN roles rd ON rd.role_name = 'Dean'
WHERE s.dean_user_id IS NOT NULL
  AND s.deleted_at IS NULL
ON CONFLICT (user_id, role_id) DO NOTHING;

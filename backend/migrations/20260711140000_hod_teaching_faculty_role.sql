-- Grant secondary Faculty role to HOD users with active teaching allocations.
-- Primary role stays HOD; enables HOD ↔ Faculty portal toggle per multi_role_rbac design.

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT DISTINCT a.faculty_user_id, rf.role_id, false
FROM academic_course_allocations a
INNER JOIN user_roles ur ON ur.user_id = a.faculty_user_id
INNER JOIN roles rh ON rh.role_id = ur.role_id AND rh.role_name = 'HOD'
CROSS JOIN roles rf
WHERE rf.role_name = 'Faculty'
  AND a.faculty_user_id IS NOT NULL
  AND a.status = 'ACTIVE'
ON CONFLICT (user_id, role_id) DO NOTHING;

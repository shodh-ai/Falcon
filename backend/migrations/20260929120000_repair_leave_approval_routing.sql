-- Repair workforce requests that were left pending without an approver.
-- Prefer the configured reporting officer, then the requester's department HOD,
-- and finally an active HR administrator. Never route a request to its requester.

UPDATE staff_leave_requests request
SET current_approver_user_id = COALESCE(
      NULLIF(staff.reporting_officer_id, request.staff_user_id),
      NULLIF(department.hod_user_id, request.staff_user_id),
      (
        SELECT candidate.user_id
        FROM users candidate
        LEFT JOIN roles primary_role ON primary_role.role_id = candidate.role_id
        LEFT JOIN user_roles candidate_role ON candidate_role.user_id = candidate.user_id
        LEFT JOIN roles secondary_role ON secondary_role.role_id = candidate_role.role_id
        WHERE candidate.tenant_id = request.tenant_id
          AND candidate.is_active = true
          AND candidate.user_id <> request.staff_user_id
          AND (
            primary_role.role_name IN ('HRAdmin', 'HR')
            OR secondary_role.role_name IN ('HRAdmin', 'HR')
          )
        ORDER BY CASE
          WHEN primary_role.role_name = 'HRAdmin' OR secondary_role.role_name = 'HRAdmin'
          THEN 0 ELSE 1 END, candidate.created_at
        LIMIT 1
      )
    ),
    current_step_order = CASE
      WHEN request.current_step_order = 0 THEN 1
      ELSE request.current_step_order
    END
FROM users staff
LEFT JOIN departments department
  ON department.dept_id = staff.dept_id
WHERE request.staff_user_id = staff.user_id
  AND request.tenant_id = staff.tenant_id
  AND request.status = 'PENDING'
  AND request.current_approver_user_id IS NULL;

-- The update intentionally leaves an unrouteable request visible with a NULL
-- approver. New submissions now fail with an actionable configuration message;
-- existing exceptions remain available to HR for explicit correction.

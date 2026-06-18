-- Default faculty-like reporting officers to their department HOD.
-- Preserves existing reporting_officer_id values (manual exceptions).

UPDATE users u
SET reporting_officer_id = d.hod_user_id,
    updated_at = NOW()
FROM departments d
INNER JOIN roles r ON r.role_id = u.role_id
WHERE u.dept_id = d.dept_id
  AND u.reporting_officer_id IS NULL
  AND u.is_active = true
  AND lower(r.role_name) IN ('faculty', 'hod', 'dean')
  AND d.hod_user_id IS NOT NULL
  AND u.user_id <> d.hod_user_id;

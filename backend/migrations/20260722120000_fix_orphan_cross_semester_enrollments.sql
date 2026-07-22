-- Drop stale ENROLLED rows on semesters that do not match student_profiles.current_semester.
-- Fixes Course Page showing wrong semester (e.g. MECH301 Sem V for Sem III students).

DELETE FROM student_course_enrollments e
USING users u
INNER JOIN student_profiles sp ON sp.user_id = u.user_id AND sp.tenant_id = u.tenant_id
INNER JOIN roles r ON r.role_id = u.role_id
WHERE e.student_user_id = u.user_id
  AND e.tenant_id = u.tenant_id
  AND r.role_name = 'Student'
  AND sp.current_semester IS NOT NULL
  AND e.semester <> sp.current_semester
  AND e.status = 'ENROLLED';

-- Lower attendance on Sachin demo enrollments in Ellwil's courses so faculty analytics shows at-risk students.
WITH ctx AS (
  SELECT
    (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu') AS tenant_id,
    (SELECT user_id FROM users WHERE lower(official_email) = 'ellwil@mygyanvihar.com') AS ellwil_id,
    (SELECT user_id FROM users WHERE lower(official_email) LIKE '%sachin%@mygyanvihar.com' LIMIT 1) AS sachin_id
)
UPDATE student_course_enrollments e
SET attendance_percent = v.new_pct
FROM ctx,
academic_courses c,
academic_timetables t,
(VALUES ('CSE301', 62.50), ('CSE302', 58.00)) AS v(course_code, new_pct)
WHERE e.tenant_id = ctx.tenant_id
  AND e.status = 'ENROLLED'
  AND e.student_user_id = ctx.sachin_id
  AND c.course_id = e.course_id
  AND c.course_code = v.course_code
  AND t.course_id = c.course_id
  AND t.faculty_user_id = ctx.ellwil_id;

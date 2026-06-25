-- Sync enrollments for all students with explicit semester/section slots.

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
student_slots AS (
  SELECT u.user_id, sp.tenant_id, sp.current_semester, sp.section_code, sp.batch
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  WHERE sp.current_semester IS NOT NULL
),
matching_allocations AS (
  SELECT
    s.user_id,
    s.tenant_id,
    s.current_semester,
    s.section_code,
    a.course_id
  FROM student_slots s
  JOIN academic_course_allocations a ON a.tenant_id = s.tenant_id
  JOIN tenant t ON t.tenant_id = s.tenant_id
  WHERE a.academic_year = '2026-2027'
    AND a.status = 'ACTIVE'
    AND a.course_id IS NOT NULL
    AND upper(replace(COALESCE(a.program_name, ''), ' ', '')) = upper(replace(COALESCE(s.batch, 'BTECH CSE'), ' ', ''))
    AND CASE upper(split_part(COALESCE(a.semester, ''), '-', 1))
      WHEN 'I' THEN 1 WHEN 'II' THEN 2 WHEN 'III' THEN 3 WHEN 'IV' THEN 4
      WHEN 'V' THEN 5 WHEN 'VI' THEN 6 WHEN 'VII' THEN 7 WHEN 'VIII' THEN 8
      ELSE NULL END = s.current_semester
    AND (
      s.section_code IS NULL
      OR split_part(COALESCE(a.semester, ''), '-', 2) = ''
      OR upper(split_part(a.semester, '-', 2)) = upper(s.section_code)
    )
)
INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, section_code, status)
SELECT tenant_id, user_id, course_id, current_semester, section_code, 'ENROLLED'
FROM matching_allocations
ON CONFLICT (tenant_id, student_user_id, course_id) DO UPDATE SET
  semester = EXCLUDED.semester,
  section_code = EXCLUDED.section_code,
  status = CASE
    WHEN student_course_enrollments.status = 'COMPLETED' THEN student_course_enrollments.status
    ELSE 'ENROLLED'
  END;

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
student_slots AS (
  SELECT u.user_id, sp.tenant_id, sp.current_semester, sp.section_code, sp.batch
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  WHERE sp.current_semester IS NOT NULL
),
valid_pairs AS (
  SELECT DISTINCT s.user_id, s.tenant_id, s.current_semester, a.course_id
  FROM student_slots s
  JOIN academic_course_allocations a ON a.tenant_id = s.tenant_id
  JOIN tenant t ON t.tenant_id = s.tenant_id
  WHERE a.academic_year = '2026-2027'
    AND a.status = 'ACTIVE'
    AND a.course_id IS NOT NULL
    AND upper(replace(COALESCE(a.program_name, ''), ' ', '')) = upper(replace(COALESCE(s.batch, 'BTECH CSE'), ' ', ''))
    AND CASE upper(split_part(COALESCE(a.semester, ''), '-', 1))
      WHEN 'I' THEN 1 WHEN 'II' THEN 2 WHEN 'III' THEN 3 WHEN 'IV' THEN 4
      WHEN 'V' THEN 5 WHEN 'VI' THEN 6 WHEN 'VII' THEN 7 WHEN 'VIII' THEN 8
      ELSE NULL END = s.current_semester
    AND (
      s.section_code IS NULL
      OR split_part(COALESCE(a.semester, ''), '-', 2) = ''
      OR upper(split_part(a.semester, '-', 2)) = upper(s.section_code)
    )
)
DELETE FROM student_course_enrollments e
USING student_slots s
WHERE e.tenant_id = s.tenant_id
  AND e.student_user_id = s.user_id
  AND e.semester = s.current_semester
  AND e.status = 'ENROLLED'
  AND NOT EXISTS (
    SELECT 1 FROM valid_pairs v
    WHERE v.user_id = e.student_user_id
      AND v.tenant_id = e.tenant_id
      AND v.current_semester = e.semester
      AND v.course_id = e.course_id
  );

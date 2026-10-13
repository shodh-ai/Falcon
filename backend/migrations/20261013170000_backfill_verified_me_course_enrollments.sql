-- Restore missing 2026–27 B.Tech Mechanical Section A course enrollments.
-- The student's active Pharmacy/other programme is never inferred here: only
-- SGVU profiles with an explicit Mechanical programme, semester and Section A
-- are matched to the corresponding active, sectioned Mechanical allocations.
-- Existing grades, attendance and enrollment rows are never changed/deleted.

BEGIN;

CREATE TEMP TABLE verified_me_enrollment_pairs ON COMMIT DROP AS
SELECT DISTINCT
  sp.tenant_id,
  sp.user_id AS student_user_id,
  a.course_id,
  sp.current_semester AS semester,
  UPPER(BTRIM(sp.section_code)) AS section_code
FROM public.tenants t
JOIN student_profiles sp ON sp.tenant_id = t.tenant_id
JOIN users u ON u.user_id = sp.user_id AND u.tenant_id = sp.tenant_id
JOIN roles r ON r.role_id = u.role_id AND r.role_name = 'Student'
JOIN academic_course_allocations a
  ON a.tenant_id = sp.tenant_id
 AND a.academic_year = '2026-2027'
 AND a.status = 'ACTIVE'
 AND a.program_name = 'B.Tech ME'
 AND a.course_id IS NOT NULL
 AND a.semester = CASE sp.current_semester
   WHEN 3 THEN 'III-A'
   WHEN 5 THEN 'V-A'
   WHEN 7 THEN 'VII-A'
   ELSE NULL
 END
WHERE t.subdomain = 'sgvu' AND t.is_active = true
  AND u.is_active = true AND u.deleted_at IS NULL
  AND sp.status = 'ACTIVE' AND sp.deleted_at IS NULL
  AND COALESCE(NULLIF(BTRIM(sp.program_name), ''), NULLIF(BTRIM(sp.batch), ''))
      = 'B.Tech Mechanical Engineering'
  AND sp.current_semester IN (3, 5, 7)
  AND UPPER(BTRIM(sp.section_code)) = 'A';

INSERT INTO student_course_enrollments
  (tenant_id, student_user_id, course_id, semester, section_code, status)
SELECT tenant_id, student_user_id, course_id, semester, section_code, 'ENROLLED'
FROM verified_me_enrollment_pairs
ON CONFLICT (tenant_id, student_user_id, course_id) DO NOTHING;

DO $$
DECLARE missing_count INTEGER;
BEGIN
  SELECT count(*) INTO missing_count
  FROM verified_me_enrollment_pairs expected
  LEFT JOIN student_course_enrollments e
    ON e.tenant_id = expected.tenant_id
   AND e.student_user_id = expected.student_user_id
   AND e.course_id = expected.course_id
  WHERE e.enrollment_id IS NULL;
  IF missing_count <> 0 THEN
    RAISE EXCEPTION 'Verified Mechanical enrollment backfill incomplete: % missing', missing_count;
  END IF;
END $$;

COMMIT;

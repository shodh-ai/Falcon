-- Timetable dedupe must not collapse section-level allocations.
-- Only remove duplicate slots for the exact same course_code (same course_id) at the same time.
-- Do not overwrite timetable faculty when multiple faculty hold active allocations for one course.

DO $$
BEGIN
  IF to_regclass('public.academic_timetables') IS NULL THEN
    RAISE NOTICE 'Skipping timetable allocation fix: table not found';
    RETURN;
  END IF;

  WITH ranked AS (
    SELECT t.timetable_id,
           ROW_NUMBER() OVER (
             PARTITION BY t.tenant_id, t.course_id, t.day_of_week, t.start_time, t.end_time
             ORDER BY
               CASE
                 WHEN t.faculty_user_id = (
                   SELECT a.faculty_user_id
                   FROM academic_course_allocations a
                   WHERE a.tenant_id = t.tenant_id
                     AND a.course_id = t.course_id
                     AND a.status = 'ACTIVE'
                     AND a.faculty_user_id IS NOT NULL
                   ORDER BY a.updated_at DESC NULLS LAST, a.created_at DESC
                   LIMIT 1
                 ) THEN 0
                 ELSE 1
               END,
               t.timetable_id DESC
           ) AS rn
    FROM academic_timetables t
    WHERE t.deleted_at IS NULL
  )
  DELETE FROM academic_timetables d
  USING ranked r
  WHERE d.timetable_id = r.timetable_id
    AND r.rn > 1;
END $$;

-- Only sync timetable faculty when exactly one active allocation exists for the course.
UPDATE academic_timetables t
   SET faculty_user_id = sole.faculty_user_id
  FROM (
    SELECT a.tenant_id, a.course_id, MIN(a.faculty_user_id::text)::uuid AS faculty_user_id
      FROM academic_course_allocations a
     WHERE a.status = 'ACTIVE'
       AND a.faculty_user_id IS NOT NULL
     GROUP BY a.tenant_id, a.course_id
    HAVING COUNT(DISTINCT a.faculty_user_id) = 1
  ) sole
 WHERE t.tenant_id = sole.tenant_id
   AND t.course_id = sole.course_id
   AND t.deleted_at IS NULL
   AND t.faculty_user_id IS DISTINCT FROM sole.faculty_user_id;

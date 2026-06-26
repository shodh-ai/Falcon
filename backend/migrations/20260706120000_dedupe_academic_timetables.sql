-- Remove duplicate academic_timetables rows created when faculty was reassigned
-- or when multiple seed migrations inserted slots for the same course/time.
-- Keeps one row per (tenant_id, course_id, day_of_week, start_time, end_time),
-- preferring the faculty on the latest active course allocation.

DO $$
DECLARE
  v_deleted INT;
BEGIN
  IF to_regclass('public.academic_timetables') IS NULL THEN
    RAISE NOTICE 'Skipping timetable dedupe: table not found';
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

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Removed % duplicate academic_timetables row(s)', v_deleted;

  -- Align surviving slot faculty only when a single active allocation exists.
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
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_academic_timetables_course_slot
  ON academic_timetables (tenant_id, course_id, day_of_week, start_time, end_time)
  WHERE deleted_at IS NULL;

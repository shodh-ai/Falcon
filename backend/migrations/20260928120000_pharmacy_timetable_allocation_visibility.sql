-- Restore department-approved Pharmacy timetable facts after faculty allocation
-- reconciliation. Timetable slots describe a course/section schedule; current
-- faculty visibility is derived from active allocations, not the legacy slot owner.

BEGIN;

WITH tenant AS (
  SELECT tenant_id
  FROM public.tenants
  WHERE subdomain = 'sgvu' AND is_active = true
  LIMIT 1
), pharmacy AS (
  SELECT dept_id
  FROM departments
  WHERE lower(dept_name) = 'pharmacy' AND deleted_at IS NULL
  ORDER BY dept_id
  LIMIT 1
), primary_allocations AS (
  SELECT DISTINCT ON (a.course_id)
    a.course_id,
    a.faculty_user_id
  FROM academic_course_allocations a
  JOIN users u
    ON u.user_id = a.faculty_user_id
   AND u.tenant_id = a.tenant_id
   AND u.deleted_at IS NULL
   AND u.is_active = true
  CROSS JOIN tenant t
  CROSS JOIN pharmacy p
  WHERE a.tenant_id = t.tenant_id
    AND a.status = 'ACTIVE'
    AND u.dept_id = p.dept_id
  ORDER BY a.course_id, a.updated_at DESC, a.allocation_id
), candidates AS (
  SELECT
    tt.timetable_id,
    pa.faculty_user_id,
    ROW_NUMBER() OVER (
      PARTITION BY tt.tenant_id, tt.course_id, tt.day_of_week,
                   tt.start_time, tt.end_time, COALESCE(tt.room, ''),
                   COALESCE(tt.section, '')
      ORDER BY tt.timetable_id
    ) AS slot_rank
  FROM academic_timetables tt
  JOIN primary_allocations pa ON pa.course_id = tt.course_id
  CROSS JOIN tenant t
  WHERE tt.tenant_id = t.tenant_id
    AND tt.deleted_at IS NOT NULL
    AND tt.room IN ('LT-25', 'LT-26', 'LT-28')
), restorable AS (
  SELECT c.timetable_id, c.faculty_user_id
  FROM candidates c
  JOIN academic_timetables tt ON tt.timetable_id = c.timetable_id
  WHERE c.slot_rank = 1
    AND NOT EXISTS (
      SELECT 1
      FROM academic_timetables active
      WHERE active.tenant_id = tt.tenant_id
        AND active.course_id = tt.course_id
        AND active.day_of_week = tt.day_of_week
        AND active.start_time = tt.start_time
        AND active.end_time = tt.end_time
        AND COALESCE(active.room, '') = COALESCE(tt.room, '')
        AND COALESCE(active.section, '') = COALESCE(tt.section, '')
        AND active.deleted_at IS NULL
    )
)
UPDATE academic_timetables tt
SET faculty_user_id = r.faculty_user_id,
    deleted_at = NULL
FROM restorable r
WHERE tt.timetable_id = r.timetable_id;

COMMIT;

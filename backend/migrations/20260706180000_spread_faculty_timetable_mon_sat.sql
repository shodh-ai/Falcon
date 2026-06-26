-- Spread faculty timetable slots across Mon–Sat (ISO days 1–6) instead of all on Monday.
-- When a faculty has more than six courses, additional hours are used (10:00, 11:00, …).

WITH ranked AS (
  SELECT
    t.timetable_id,
    ROW_NUMBER() OVER (
      PARTITION BY t.tenant_id, t.faculty_user_id
      ORDER BY c.course_code, t.timetable_id
    ) - 1 AS slot_idx
  FROM academic_timetables t
  INNER JOIN academic_courses c ON c.course_id = t.course_id
  WHERE t.deleted_at IS NULL
    AND t.faculty_user_id IS NOT NULL
)
UPDATE academic_timetables t
SET
  day_of_week = (ranked.slot_idx % 6) + 1,
  start_time = ('09:00'::time + (ranked.slot_idx / 6) * interval '1 hour'),
  end_time = ('10:00'::time + (ranked.slot_idx / 6) * interval '1 hour')
FROM ranked
WHERE t.timetable_id = ranked.timetable_id;

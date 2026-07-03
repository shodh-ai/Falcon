-- Spread faculty timetable slots across Mon–Sat (ISO days 1–6) instead of all on Monday.
-- When a faculty has more than six courses, additional hours are used (10:00, 11:00, …).

-- One timetable row per course before reshuffling (avoids uq_academic_timetables_course_slot).
WITH dupes AS (
  SELECT
    t.timetable_id,
    ROW_NUMBER() OVER (
      PARTITION BY t.tenant_id, t.course_id
      ORDER BY t.timetable_id DESC
    ) AS rn
  FROM academic_timetables t
  WHERE t.deleted_at IS NULL
)
DELETE FROM academic_timetables t
USING dupes d
WHERE t.timetable_id = d.timetable_id
  AND d.rn > 1;

-- Phase 1: scatter to unique staging slots so in-place updates never collide.
WITH staging AS (
  SELECT
    t.timetable_id,
    ROW_NUMBER() OVER (ORDER BY t.timetable_id) AS rn
  FROM academic_timetables t
  WHERE t.deleted_at IS NULL
)
UPDATE academic_timetables t
SET
  day_of_week = 7,
  start_time = ('05:00'::time + staging.rn * interval '1 minute'),
  end_time = ('05:30'::time + staging.rn * interval '1 minute')
FROM staging
WHERE t.timetable_id = staging.timetable_id;

-- Phase 2: assign final Mon–Sat spread (one slot per course).
WITH ranked AS (
  SELECT
    t.timetable_id,
    ROW_NUMBER() OVER (
      PARTITION BY t.tenant_id, t.course_id
      ORDER BY t.timetable_id
    ) - 1 AS slot_idx
  FROM academic_timetables t
  WHERE t.deleted_at IS NULL
)
UPDATE academic_timetables t
SET
  day_of_week = (ranked.slot_idx % 6) + 1,
  start_time = ('09:00'::time + (ranked.slot_idx / 6) * interval '1 hour'),
  end_time = ('10:00'::time + (ranked.slot_idx / 6) * interval '1 hour')
FROM ranked
WHERE t.timetable_id = ranked.timetable_id;

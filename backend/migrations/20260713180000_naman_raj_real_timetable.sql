-- Real weekly timetable for Naman Raj (AESTR CSE workload 2026-2027).
-- Source: Work load AESTR (1).pdf — III-A (AI + SODECA), V-A/B (NLP), VII-A/B (Field Project 7).
-- One slot per unique course; no duplicate Mon 9 AM stacking from spaced/unspaced course codes.

WITH faculty AS (
  SELECT user_id, tenant_id
  FROM users
  WHERE lower(official_email) = 'naman.raj@mygyanvihar.com'
  LIMIT 1
),
canonical_courses AS (
  SELECT DISTINCT ON (UPPER(REPLACE(c.course_code, ' ', '')))
    UPPER(REPLACE(c.course_code, ' ', '')) AS norm_code,
    c.course_id,
    c.course_code
  FROM academic_courses c
  INNER JOIN faculty f ON f.tenant_id = c.tenant_id
  WHERE UPPER(REPLACE(c.course_code, ' ', '')) IN (
    'CS3101', 'CS3151', 'SODECA-III', 'CP325', 'CP399', 'UC351', 'UC451'
  )
  ORDER BY
    UPPER(REPLACE(c.course_code, ' ', '')),
    CASE WHEN c.course_code NOT LIKE '% %' THEN 0 ELSE 1 END,
    c.course_id
),
repoint_allocations AS (
  UPDATE academic_course_allocations a
  SET course_id = canon.course_id,
      updated_at = NOW()
  FROM faculty f,
       academic_courses spaced,
       canonical_courses canon
  WHERE a.faculty_user_id = f.user_id
    AND a.academic_year = '2026-2027'
    AND a.status = 'ACTIVE'
    AND a.course_id = spaced.course_id
    AND canon.norm_code = UPPER(REPLACE(spaced.course_code, ' ', ''))
    AND spaced.course_id <> canon.course_id
  RETURNING a.allocation_id
)
DELETE FROM academic_timetables t
USING faculty f
WHERE t.faculty_user_id = f.user_id;

WITH faculty AS (
  SELECT user_id, tenant_id
  FROM users
  WHERE lower(official_email) = 'naman.raj@mygyanvihar.com'
  LIMIT 1
),
canonical_courses AS (
  SELECT DISTINCT ON (UPPER(REPLACE(c.course_code, ' ', '')))
    UPPER(REPLACE(c.course_code, ' ', '')) AS norm_code,
    c.course_id
  FROM academic_courses c
  INNER JOIN faculty f ON f.tenant_id = c.tenant_id
  WHERE UPPER(REPLACE(c.course_code, ' ', '')) IN (
    'CS3101', 'CS3151', 'SODECA-III', 'CP325', 'CP399', 'UC351', 'UC451'
  )
  ORDER BY
    UPPER(REPLACE(c.course_code, ' ', '')),
    CASE WHEN c.course_code NOT LIKE '% %' THEN 0 ELSE 1 END,
    c.course_id
),
slots AS (
  SELECT * FROM (VALUES
    ('CS3101',     3, '09:00'::time, '10:00'::time, 'CSE-301',     'A'),
    ('CS3151',     4, '09:00'::time, '10:00'::time, 'CSE Lab-2',   'A'),
    ('SODECA-III', 5, '09:00'::time, '10:00'::time, 'Seminar Hall','A'),
    ('CP325',      1, '10:00'::time, '11:00'::time, 'CSE-302',     'A'),
    ('CP399',      2, '10:00'::time, '11:00'::time, 'CSE Lab-1',   'A'),
    ('UC351',      1, '14:00'::time, '15:00'::time, 'Field Visit', 'A'),
    ('UC451',      4, '14:00'::time, '15:00'::time, 'Field Visit', 'A')
  ) AS v(norm_code, day_of_week, start_time, end_time, room, section)
)
INSERT INTO academic_timetables (
  tenant_id, course_id, faculty_user_id, day_of_week, start_time, end_time, room, section
)
SELECT
  f.tenant_id,
  c.course_id,
  f.user_id,
  s.day_of_week,
  s.start_time,
  s.end_time,
  s.room,
  s.section
FROM faculty f
CROSS JOIN slots s
INNER JOIN canonical_courses c ON c.norm_code = s.norm_code
ON CONFLICT (tenant_id, course_id, day_of_week, start_time, end_time)
WHERE deleted_at IS NULL
DO UPDATE SET
  faculty_user_id = EXCLUDED.faculty_user_id,
  room = EXCLUDED.room,
  section = EXCLUDED.section;

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'academics.naman_raj_timetable',
  'Faculty',
  'naman.raj@mygyanvihar.com',
  'Weekly timetable',
  '7 slots Mon–Fri (III-A AI, V NLP, VII field projects)',
  'AESTR CSE 2026-2027 — deduped course codes, no overlapping Mon 9 AM placeholders'
)
ON CONFLICT (smoke_key) DO UPDATE SET
  sample_record = EXCLUDED.sample_record,
  notes = EXCLUDED.notes,
  seeded_at = NOW();

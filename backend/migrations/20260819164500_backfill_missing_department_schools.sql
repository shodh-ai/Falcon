-- Backfill legacy departments that predate departments.school_id.
-- These departments already carry the intended school label in description and
-- are referenced across existing Falcon seeds, but the corresponding school row
-- was never created in schools.

WITH primary_campus AS (
  SELECT campus_id
  FROM campuses
  WHERE deleted_at IS NULL
  ORDER BY campus_id
  LIMIT 1
),
expected_schools AS (
  SELECT *
  FROM (
    VALUES
      ('School of Computing & IT', NULL::text),
      ('Department of Electrical Engineering', NULL::text)
  ) AS expected(school_name, school_code)
),
missing_school_refs AS (
  SELECT DISTINCT
    expected.school_name,
    expected.school_code
  FROM departments d
  JOIN expected_schools expected
    ON lower(expected.school_name) = lower(coalesce(d.description, ''))
  LEFT JOIN schools s
    ON lower(s.school_name) = lower(expected.school_name)
   AND s.deleted_at IS NULL
  WHERE d.deleted_at IS NULL
    AND d.school_id IS NULL
    AND s.school_id IS NULL
)
INSERT INTO schools (school_name, school_code, campus_id)
SELECT missing.school_name, missing.school_code, campus.campus_id
FROM missing_school_refs missing
CROSS JOIN primary_campus campus;

UPDATE departments d
SET school_id = s.school_id,
    updated_at = NOW()
FROM schools s
WHERE d.deleted_at IS NULL
  AND d.school_id IS NULL
  AND lower(coalesce(d.description, '')) = lower(s.school_name)
  AND s.deleted_at IS NULL;

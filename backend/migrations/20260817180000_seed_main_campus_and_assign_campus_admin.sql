-- Academic campuses table was empty: schools had no campus_id, so Campus Admin
-- could not resolve an assigned campus. Seed the university campus using the
-- existing campuses/schools/hierarchy_assignments model (no new columns).

INSERT INTO campuses (campus_name, campus_code, address)
SELECT 'Suresh Gyan Vihar University', 'SGVU', 'Jaipur'
WHERE NOT EXISTS (
  SELECT 1 FROM campuses WHERE deleted_at IS NULL
);

UPDATE schools s
SET campus_id = c.campus_id
FROM (
  SELECT campus_id
  FROM campuses
  WHERE deleted_at IS NULL
  ORDER BY campus_id ASC
  LIMIT 1
) c
WHERE s.deleted_at IS NULL
  AND s.campus_id IS NULL;

INSERT INTO hierarchy_assignments (
  tenant_id,
  user_id,
  assignment_type,
  entity_type,
  entity_id
)
SELECT
  u.tenant_id,
  u.user_id,
  'CAMPUS_ADMIN',
  'CAMPUS',
  c.campus_id::text
FROM users u
JOIN campuses c
  ON c.campus_id = (
    SELECT MIN(campus_id) FROM campuses WHERE deleted_at IS NULL
  )
WHERE lower(u.official_email) = 'campusadmin@mygyanvihar.com'
  AND NOT EXISTS (
    SELECT 1
    FROM hierarchy_assignments ha
    WHERE ha.user_id = u.user_id
      AND upper(ha.entity_type) = 'CAMPUS'
  );

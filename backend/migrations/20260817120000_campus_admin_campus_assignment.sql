-- Assign the seeded Campus Admin account to the first academic campus.
-- Campus Admin must never receive every campus automatically when more than one exists.

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

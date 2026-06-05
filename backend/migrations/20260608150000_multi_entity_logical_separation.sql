-- Logical multi-entity separation: primary entity_id on core tables + backfill.

WITH default_ent AS (
  SELECT tenant_id, entity_id FROM org_entities WHERE entity_code = 'SGVU_UNIVERSITY'
)
UPDATE hr_shifts s
SET entity_id = de.entity_id
FROM default_ent de
WHERE s.entity_id IS NULL;

-- users.primary org entity (home campus)
ALTER TABLE users ADD COLUMN IF NOT EXISTS entity_id INT NULL REFERENCES org_entities(entity_id);

WITH default_ent AS (
  SELECT tenant_id, entity_id FROM org_entities WHERE entity_code = 'SGVU_UNIVERSITY'
)
UPDATE users u
SET entity_id = hep.entity_id
FROM hr_employee_profiles hep
WHERE u.user_id = hep.user_id AND u.entity_id IS NULL AND hep.entity_id IS NOT NULL;

WITH default_ent AS (
  SELECT tenant_id, entity_id FROM org_entities WHERE entity_code = 'SGVU_UNIVERSITY'
)
UPDATE users u
SET entity_id = de.entity_id
FROM default_ent de
WHERE u.tenant_id = de.tenant_id AND u.entity_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_entity ON users(tenant_id, entity_id);

-- academic_courses scoped to org entity
ALTER TABLE academic_courses ADD COLUMN IF NOT EXISTS entity_id INT NULL REFERENCES org_entities(entity_id);

WITH default_ent AS (
  SELECT tenant_id, entity_id FROM org_entities WHERE entity_code = 'SGVU_UNIVERSITY'
)
UPDATE academic_courses c
SET entity_id = de.entity_id
FROM default_ent de
WHERE c.tenant_id = de.tenant_id AND c.entity_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_academic_courses_entity ON academic_courses(tenant_id, entity_id);

-- academic timetables + enrollments inherit entity from course
ALTER TABLE academic_timetables ADD COLUMN IF NOT EXISTS entity_id INT NULL REFERENCES org_entities(entity_id);
ALTER TABLE student_course_enrollments ADD COLUMN IF NOT EXISTS entity_id INT NULL REFERENCES org_entities(entity_id);

UPDATE academic_timetables t
SET entity_id = c.entity_id
FROM academic_courses c
WHERE t.course_id = c.course_id AND t.tenant_id = c.tenant_id AND t.entity_id IS NULL;

UPDATE student_course_enrollments e
SET entity_id = c.entity_id
FROM academic_courses c
WHERE e.course_id = c.course_id AND e.tenant_id = c.tenant_id AND e.entity_id IS NULL;

-- Enforce hr_shifts NOT NULL where data exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM hr_shifts WHERE entity_id IS NULL) THEN
    RAISE NOTICE 'hr_shifts rows still missing entity_id — run tenant seed first';
  ELSE
    ALTER TABLE hr_shifts ALTER COLUMN entity_id SET NOT NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

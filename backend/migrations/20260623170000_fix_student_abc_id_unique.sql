-- abc_id was globally UNIQUE; seed data used placeholder 123456789012 on student1.
-- Onboarding POST then 500'd when another student entered the same or conflicting ABC ID.
-- Scope uniqueness per tenant and clear the demo placeholder.

ALTER TABLE student_profiles DROP CONSTRAINT IF EXISTS student_profiles_abc_id_key;

DROP INDEX IF EXISTS idx_student_profiles_tenant_abc_id;

CREATE UNIQUE INDEX idx_student_profiles_tenant_abc_id
  ON student_profiles (tenant_id, abc_id)
  WHERE abc_id IS NOT NULL AND btrim(abc_id) <> '';

UPDATE student_profiles
SET abc_id = NULL
WHERE abc_id = '123456789012';

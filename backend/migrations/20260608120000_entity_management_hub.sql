-- Entity Management Hub: extended org_entities + user_entity_access mapping

ALTER TABLE org_entities ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE org_entities ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);
ALTER TABLE org_entities ADD COLUMN IF NOT EXISTS tax_id VARCHAR(50);
ALTER TABLE org_entities ADD COLUMN IF NOT EXISTS logo_url TEXT;

CREATE TABLE IF NOT EXISTS user_entity_access (
  access_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  entity_id INT NOT NULL REFERENCES org_entities(entity_id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  UNIQUE (user_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_user_entity_access_user ON user_entity_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_entity_access_entity ON user_entity_access(entity_id);

-- Backfill: SuperAdmin + HRAdmin + HR see all tenant entities (preserves prior behavior)
INSERT INTO user_entity_access (user_id, entity_id)
SELECT DISTINCT u.user_id, oe.entity_id
FROM users u
INNER JOIN org_entities oe ON oe.tenant_id = u.tenant_id AND oe.is_active = true
INNER JOIN user_roles ur ON ur.user_id = u.user_id
INNER JOIN roles r ON r.role_id = ur.role_id
WHERE u.is_active = true
  AND r.role_name IN ('SuperAdmin', 'HRAdmin', 'HR', 'President')
ON CONFLICT (user_id, entity_id) DO NOTHING;

-- Backfill: staff mapped to their profile entity
INSERT INTO user_entity_access (user_id, entity_id)
SELECT ep.user_id, ep.entity_id
FROM hr_employee_profiles ep
WHERE ep.entity_id IS NOT NULL
ON CONFLICT (user_id, entity_id) DO NOTHING;

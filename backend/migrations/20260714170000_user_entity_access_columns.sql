-- Align user_entity_access with entity management hub schema (legacy tables may only have user_id + entity_id).

ALTER TABLE user_entity_access
  ADD COLUMN IF NOT EXISTS access_id UUID DEFAULT gen_random_uuid();

ALTER TABLE user_entity_access
  ADD COLUMN IF NOT EXISTS granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE user_entity_access
  ADD COLUMN IF NOT EXISTS granted_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL;

UPDATE user_entity_access
SET access_id = gen_random_uuid()
WHERE access_id IS NULL;

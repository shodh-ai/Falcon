-- Ensure soft-delete + login-critical schema exists on production.
-- Safe / idempotent: only ADD COLUMN IF NOT EXISTS and CREATE TABLE IF NOT EXISTS.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reporting_officer_id UUID NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS entity_id INT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(50) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token VARCHAR(255) NULL;

CREATE TABLE IF NOT EXISTS org_entities (
  entity_id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  entity_code VARCHAR(64) NOT NULL,
  entity_name VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, entity_code)
);

CREATE TABLE IF NOT EXISTS hr_permissions (
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by_user_id UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS hr_access_controls (
  access_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  module_name VARCHAR(64) NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_approve BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  department_scope INT[] NULL,
  entity_scope INT[] NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id, module_name)
);

CREATE INDEX IF NOT EXISTS idx_hr_access_controls_user
  ON hr_access_controls(tenant_id, user_id);

CREATE INDEX IF NOT EXISTS idx_org_entities_tenant
  ON org_entities(tenant_id);

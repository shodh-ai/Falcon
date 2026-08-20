-- Admin Control Center: settings, RBAC overrides, backups, operational audit

CREATE TABLE IF NOT EXISTS admin_system_settings (
  tenant_id UUID NOT NULL PRIMARY KEY,
  university_name VARCHAR(255) NOT NULL DEFAULT 'Falcon University',
  university_code VARCHAR(64),
  branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  email_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  sms_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  theme JSONB NOT NULL DEFAULT '{}'::jsonb,
  password_policy JSONB NOT NULL DEFAULT '{"minLength":8,"requireUpper":true,"requireNumber":true,"requireSpecial":false}'::jsonb,
  security_settings JSONB NOT NULL DEFAULT '{"sessionTimeoutMinutes":60,"mfaRecommended":true}'::jsonb,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_role_permission_overrides (
  override_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  role_name VARCHAR(100) NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '{"view":[],"edit":[],"approve":[],"create":[],"read":[],"update":[],"delete":[],"export":[]}'::jsonb,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, role_name)
);

CREATE INDEX IF NOT EXISTS idx_admin_role_perm_tenant
  ON admin_role_permission_overrides (tenant_id);

CREATE TABLE IF NOT EXISTS admin_backup_history (
  backup_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  backup_type VARCHAR(32) NOT NULL DEFAULT 'FULL',
  storage_path TEXT,
  size_bytes BIGINT,
  checksum VARCHAR(128),
  notes TEXT,
  triggered_by UUID,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_backup_tenant_started
  ON admin_backup_history (tenant_id, started_at DESC);

CREATE TABLE IF NOT EXISTS admin_control_audit (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  actor_user_id UUID,
  action VARCHAR(64) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_id VARCHAR(128),
  details JSONB,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_control_audit_tenant_created
  ON admin_control_audit (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_control_audit_action
  ON admin_control_audit (tenant_id, action);

CREATE TABLE IF NOT EXISTS admin_academic_calendar_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  title VARCHAR(255) NOT NULL,
  event_type VARCHAR(64) NOT NULL DEFAULT 'UNIVERSITY_EVENT',
  starts_on DATE NOT NULL,
  ends_on DATE,
  description TEXT,
  is_all_day BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admin_calendar_tenant_dates
  ON admin_academic_calendar_events (tenant_id, starts_on)
  WHERE deleted_at IS NULL;

-- Admin ERP master control: login history, academic structure, comms, security

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(64),
  ADD COLUMN IF NOT EXISTS account_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_users_last_login
  ON users (tenant_id, last_login_at DESC);

CREATE TABLE IF NOT EXISTS admin_login_history (
  login_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  email VARCHAR(255),
  ip_address VARCHAR(64),
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_login_history_tenant
  ON admin_login_history (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_password_reset_tokens (
  token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_reset_tokens_user
  ON admin_password_reset_tokens (user_id, expires_at);

CREATE TABLE IF NOT EXISTS admin_error_logs (
  error_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  source VARCHAR(64) NOT NULL DEFAULT 'API',
  level VARCHAR(16) NOT NULL DEFAULT 'error',
  message TEXT NOT NULL,
  stack TEXT,
  path VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_error_logs_tenant
  ON admin_error_logs (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_academic_years (
  year_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  year_label VARCHAR(32) NOT NULL,
  starts_on DATE,
  ends_on DATE,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (tenant_id, year_label)
);

CREATE TABLE IF NOT EXISTS admin_programs (
  program_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  program_name VARCHAR(255) NOT NULL,
  program_code VARCHAR(64),
  school_id INT,
  dept_id INT,
  duration_years INT,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admin_programs_tenant
  ON admin_programs (tenant_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS admin_semesters (
  semester_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  semester_name VARCHAR(64) NOT NULL,
  semester_no INT,
  academic_year_id UUID REFERENCES admin_academic_years(year_id),
  starts_on DATE,
  ends_on DATE,
  registration_starts_on DATE,
  registration_ends_on DATE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS admin_sections (
  section_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  section_name VARCHAR(32) NOT NULL,
  program_id UUID,
  semester_no INT,
  batch_label VARCHAR(64),
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS admin_batches (
  batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  batch_label VARCHAR(64) NOT NULL,
  program_id UUID,
  start_year INT,
  end_year INT,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (tenant_id, batch_label)
);

CREATE TABLE IF NOT EXISTS admin_subjects (
  subject_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  subject_code VARCHAR(50) NOT NULL,
  subject_name VARCHAR(255) NOT NULL,
  credits INT NOT NULL DEFAULT 0,
  course_id UUID,
  dept_id INT,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (tenant_id, subject_code)
);

CREATE TABLE IF NOT EXISTS admin_announcements (
  announcement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  category VARCHAR(32) NOT NULL DEFAULT 'CIRCULAR',
  audience VARCHAR(32) NOT NULL DEFAULT 'everyone',
  is_emergency BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admin_announcements_tenant
  ON admin_announcements (tenant_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS admin_fee_structures (
  fee_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  program_id UUID,
  academic_year VARCHAR(32),
  fee_type VARCHAR(64) NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_on DATE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS admin_portal_access (
  access_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  portal_key VARCHAR(64) NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, portal_key)
);

INSERT INTO admin_portal_access (tenant_id, portal_key, is_enabled)
SELECT t.tenant_id, p.portal_key, true
FROM tenants t
CROSS JOIN (VALUES
  ('student'), ('faculty'), ('hod'), ('registrar'),
  ('finance'), ('library'), ('placement'), ('hostel'), ('admin')
) AS p(portal_key)
ON CONFLICT (tenant_id, portal_key) DO NOTHING;

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

ALTER TABLE admin_control_audit
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID;

-- E-Cell & Incubation Hub

INSERT INTO roles (role_name, description)
VALUES ('ECellAdmin', 'Application role for E-Cell & Incubation Hub administration')
ON CONFLICT (role_name) DO UPDATE
SET description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS ecell_configurations (
  config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  cohort_name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_funding_limit DECIMAL(12, 2),
  level_1_approver_role VARCHAR(50) NOT NULL DEFAULT 'HOD',
  level_2_approver_role VARCHAR(50) NOT NULL DEFAULT 'Dean',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ecell_projects (
  project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  config_id UUID REFERENCES ecell_configurations(config_id) ON DELETE SET NULL,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  startup_name VARCHAR(255) NOT NULL,
  innovation_description TEXT NOT NULL,
  pitch_deck_url TEXT,
  requested_funding DECIMAL(12, 2) NOT NULL,
  approved_funding_amount DECIMAL(12, 2),
  current_status VARCHAR(50) NOT NULL DEFAULT 'SUBMITTED',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ecell_projects_status_check CHECK (
    current_status IN (
      'SUBMITTED',
      'UNDER_L1_REVIEW',
      'L1_APPROVED',
      'L2_APPROVED',
      'REJECTED',
      'FUNDED'
    )
  )
);

CREATE TABLE IF NOT EXISTS ecell_approvals (
  approval_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES ecell_projects(project_id) ON DELETE CASCADE,
  approver_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  approval_level INT NOT NULL CHECK (approval_level IN (1, 2)),
  status VARCHAR(20) NOT NULL CHECK (status IN ('APPROVED', 'REJECTED')),
  approved_funding_amount DECIMAL(12, 2),
  remarks TEXT,
  action_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ecell_disbursement_requests (
  disbursement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES ecell_projects(project_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  grant_tag VARCHAR(100) NOT NULL DEFAULT 'E-Cell Grant',
  bank_account_ref TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  journal_source_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at TIMESTAMPTZ,
  CONSTRAINT ecell_disbursement_status_check CHECK (status IN ('PENDING', 'POSTED'))
);

CREATE INDEX IF NOT EXISTS idx_ecell_configurations_tenant_active
  ON ecell_configurations(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ecell_projects_tenant_status
  ON ecell_projects(tenant_id, current_status);
CREATE INDEX IF NOT EXISTS idx_ecell_projects_student
  ON ecell_projects(student_user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_ecell_approvals_project_level
  ON ecell_approvals(project_id, approval_level, action_date DESC);
CREATE INDEX IF NOT EXISTS idx_ecell_disbursement_tenant_status
  ON ecell_disbursement_requests(tenant_id, status, created_at DESC);

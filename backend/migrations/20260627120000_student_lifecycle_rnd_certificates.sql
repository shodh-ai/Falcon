-- Student R&D Grants + Certificate Automation (Convocation)

-- ── Academic R&D ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS academic_rnd_configs (
  config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  deadline TIMESTAMPTZ,
  attachment_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academic_rnd_applications (
  application_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  config_id UUID REFERENCES academic_rnd_configs(config_id) ON DELETE SET NULL,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  guide_faculty_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  project_title VARCHAR(255) NOT NULL,
  requested_budget DECIMAL(12, 2),
  documents JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(50) NOT NULL DEFAULT 'SUBMITTED',
  budget_approved BOOLEAN NOT NULL DEFAULT false,
  ranking_score DECIMAL(5, 2),
  ranking_status VARCHAR(50),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT academic_rnd_applications_status_check CHECK (
    status IN (
      'SUBMITTED',
      'PENDING_GUIDE',
      'GUIDE_REJECTED',
      'PENDING_BUDGET',
      'BUDGET_REJECTED',
      'PENDING_RANKING',
      'GRANT_APPROVED',
      'GRANT_REJECTED'
    )
  ),
  CONSTRAINT academic_rnd_ranking_status_check CHECK (
    ranking_status IS NULL OR ranking_status IN ('APPROVED', 'REJECTED')
  )
);

CREATE TABLE IF NOT EXISTS academic_rnd_approvals (
  approval_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES academic_rnd_applications(application_id) ON DELETE CASCADE,
  approver_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  approval_tier VARCHAR(30) NOT NULL CHECK (approval_tier IN ('GUIDE', 'BUDGET', 'RANKING')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('APPROVED', 'REJECTED')),
  remarks TEXT,
  ranking_score DECIMAL(5, 2),
  action_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academic_rnd_configs_tenant_active
  ON academic_rnd_configs(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_academic_rnd_applications_tenant_status
  ON academic_rnd_applications(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_academic_rnd_applications_student
  ON academic_rnd_applications(student_user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_academic_rnd_approvals_application
  ON academic_rnd_approvals(application_id, approval_tier, action_date DESC);

-- ── Certificate Automation & Convocation ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS cert_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  event_name VARCHAR(255) NOT NULL,
  application_start_date DATE NOT NULL,
  application_end_date DATE NOT NULL,
  base_fee DECIMAL(10, 2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cert_applications (
  application_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES cert_events(event_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  finance_demand_id UUID REFERENCES finance_fee_demands(demand_id) ON DELETE SET NULL,
  fee_transaction_id VARCHAR(100),
  verification_status VARCHAR(50) NOT NULL DEFAULT 'PAYMENT_PENDING',
  certificate_generated BOOLEAN NOT NULL DEFAULT false,
  certificate_url TEXT,
  digilocker_pushed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cert_applications_verification_check CHECK (
    verification_status IN (
      'PAYMENT_PENDING',
      'PENDING_VERIFICATION',
      'VERIFIED',
      'REJECTED'
    )
  ),
  UNIQUE (event_id, student_user_id)
);

CREATE INDEX IF NOT EXISTS idx_cert_events_tenant_active
  ON cert_events(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_cert_applications_event_status
  ON cert_applications(event_id, verification_status);
CREATE INDEX IF NOT EXISTS idx_cert_applications_student
  ON cert_applications(student_user_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_cert_applications_demand
  ON cert_applications(finance_demand_id);

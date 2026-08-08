-- Registrar enrollment runs audit + student petitions desk

CREATE TABLE IF NOT EXISTS registrar_enrollment_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  lead_id UUID,
  student_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  enrollment_no VARCHAR(64),
  prn_number VARCHAR(64),
  fee_verified BOOLEAN NOT NULL DEFAULT false,
  program_name VARCHAR(200),
  department_name VARCHAR(200),
  school_name VARCHAR(200),
  batch VARCHAR(50),
  semester INT,
  section_code VARCHAR(10),
  degree_name VARCHAR(120),
  status VARCHAR(40) NOT NULL DEFAULT 'COMPLETED'
    CHECK (status IN ('COMPLETED', 'FAILED')),
  enrolled_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reg_enrollment_runs_tenant_status
  ON registrar_enrollment_runs (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reg_enrollment_runs_tenant_lead
  ON registrar_enrollment_runs (tenant_id, lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS registrar_petitions (
  petition_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  petition_type VARCHAR(40) NOT NULL
    CHECK (petition_type IN (
      'TRANSFER_CERTIFICATE',
      'NAME_CORRECTION',
      'COURSE_CHANGE',
      'MIGRATION_CERTIFICATE'
    )),
  student_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  student_name VARCHAR(200) NOT NULL,
  enrollment_no VARCHAR(64),
  current_value TEXT,
  requested_value TEXT NOT NULL,
  reason TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'ISSUED')),
  documents_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  registrar_remarks TEXT,
  decided_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reg_petitions_tenant_status
  ON registrar_petitions (tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_reg_petitions_tenant_type
  ON registrar_petitions (tenant_id, petition_type, updated_at DESC);

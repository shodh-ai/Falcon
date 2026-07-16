-- Examination Cell enterprise foundation: sessions, audit logs, extended roles

CREATE TABLE IF NOT EXISTS exam_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  academic_year VARCHAR(12) NOT NULL,
  session_name VARCHAR(120) NOT NULL,
  cycle_type VARCHAR(30) NOT NULL DEFAULT 'END_SEMESTER'
    CHECK (cycle_type IN (
      'ODD_SEMESTER', 'EVEN_SEMESTER', 'MID_SEMESTER', 'END_SEMESTER',
      'SUPPLEMENTARY', 'IMPROVEMENT', 'BACK_PAPER', 'PRACTICAL', 'VIVA'
    )),
  semester INT,
  program_label VARCHAR(80),
  start_date DATE,
  end_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'OPEN', 'ACTIVE', 'CLOSED', 'ARCHIVED')),
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_sessions_tenant_status
  ON exam_sessions(tenant_id, status);

CREATE TABLE IF NOT EXISTS exam_audit_logs (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(user_id),
  action VARCHAR(80) NOT NULL,
  resource_type VARCHAR(60) NOT NULL,
  resource_id VARCHAR(120),
  old_value JSONB,
  new_value JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_audit_logs_tenant_created
  ON exam_audit_logs(tenant_id, created_at DESC);

INSERT INTO roles (role_name, description)
VALUES
  ('DeputyCOE', 'Deputy Controller of Examinations'),
  ('ExamAdmin', 'Examination administrator — schedules, hall tickets, seating'),
  ('ExamOperator', 'Examination operator — day-to-day exam desk operations')
ON CONFLICT (role_name) DO NOTHING;

DO $$
DECLARE
  v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF v_tenant IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM exam_sessions WHERE tenant_id = v_tenant LIMIT 1) THEN
    INSERT INTO exam_sessions (
      tenant_id, academic_year, session_name, cycle_type, semester,
      program_label, start_date, end_date, status
    ) VALUES (
      v_tenant,
      '2025-26',
      'B.Tech End Semester Examination',
      'END_SEMESTER',
      4,
      'B.Tech',
      CURRENT_DATE + 14,
      CURRENT_DATE + 45,
      'ACTIVE'
    );
  END IF;
END $$;

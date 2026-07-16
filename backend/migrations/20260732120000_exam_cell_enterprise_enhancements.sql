-- Examination Cell enterprise enhancements: calendar, approvals, answer sheets, deadlines, documents, grace marks, degree audit

CREATE TABLE IF NOT EXISTS exam_calendar_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  event_type VARCHAR(40) NOT NULL DEFAULT 'EXAM'
    CHECK (event_type IN (
      'ACADEMIC', 'MID_SEMESTER', 'END_SEMESTER', 'PRACTICAL', 'VIVA',
      'HOLIDAY', 'HALL_TICKET_RELEASE', 'RESULT_DECLARATION', 'REVALUATION',
      'SUPPLEMENTARY', 'DEADLINE', 'OTHER'
    )),
  event_date DATE NOT NULL,
  end_date DATE,
  start_time TIME,
  end_time TIME,
  department VARCHAR(80),
  program_label VARCHAR(80),
  semester INT,
  exam_schedule_id UUID REFERENCES exam_schedules(exam_schedule_id) ON DELETE SET NULL,
  color_code VARCHAR(20) DEFAULT '#1e3a5f',
  description TEXT,
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_calendar_events_tenant_date
  ON exam_calendar_events(tenant_id, event_date);

CREATE TABLE IF NOT EXISTS hall_ticket_approvals (
  approval_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  semester INT NOT NULL,
  batch_label VARCHAR(80),
  stage VARCHAR(30) NOT NULL DEFAULT 'REGISTRATION'
    CHECK (stage IN ('REGISTRATION', 'ELIGIBILITY', 'FINANCE', 'EXAM_OFFICE', 'COE', 'APPROVED', 'REJECTED')),
  eligibility_status VARCHAR(20) DEFAULT 'PENDING',
  finance_status VARCHAR(20) DEFAULT 'PENDING',
  exam_office_status VARCHAR(20) DEFAULT 'PENDING',
  coe_status VARCHAR(20) DEFAULT 'PENDING',
  block_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  approved_by UUID REFERENCES users(user_id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, student_user_id, semester, batch_label)
);

CREATE INDEX IF NOT EXISTS idx_hall_ticket_approvals_stage
  ON hall_ticket_approvals(tenant_id, stage);

CREATE TABLE IF NOT EXISTS answer_sheet_tracking (
  sheet_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  sheet_number VARCHAR(40) NOT NULL,
  exam_schedule_id UUID REFERENCES exam_schedules(exam_schedule_id) ON DELETE SET NULL,
  student_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  qr_payload VARCHAR(120) NOT NULL,
  barcode_payload VARCHAR(80),
  status VARCHAR(30) NOT NULL DEFAULT 'ISSUED'
    CHECK (status IN (
      'ISSUED', 'COLLECTED', 'PACKED', 'DISPATCHED',
      'EVALUATOR_ASSIGNED', 'CHECKED', 'RETURNED', 'ARCHIVED'
    )),
  evaluator_user_id UUID REFERENCES users(user_id),
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, sheet_number)
);

CREATE INDEX IF NOT EXISTS idx_answer_sheet_tracking_status
  ON answer_sheet_tracking(tenant_id, status);

CREATE TABLE IF NOT EXISTS student_identity_verifications (
  verification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  exam_schedule_id UUID REFERENCES exam_schedules(exam_schedule_id) ON DELETE SET NULL,
  qr_payload VARCHAR(120),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by UUID REFERENCES users(user_id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_deadlines (
  deadline_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  deadline_type VARCHAR(40) NOT NULL
    CHECK (deadline_type IN (
      'EXAM_REGISTRATION', 'FEE_PAYMENT', 'HALL_TICKET_RELEASE',
      'INTERNAL_MARKS', 'RESULT_DECLARATION', 'REVALUATION',
      'SUPPLEMENTARY_REGISTRATION', 'OTHER'
    )),
  due_at TIMESTAMPTZ NOT NULL,
  semester INT,
  program_label VARCHAR(80),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'CLOSED', 'ARCHIVED')),
  reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_deadlines_tenant_due
  ON exam_deadlines(tenant_id, due_at);

CREATE TABLE IF NOT EXISTS student_exam_documents (
  doc_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  document_type VARCHAR(40) NOT NULL
    CHECK (document_type IN (
      'AADHAAR', 'MIGRATION_CERT', 'TENTH_MARKSHEET', 'TWELFTH_MARKSHEET',
      'CATEGORY_CERT', 'PHOTOGRAPH', 'SIGNATURE', 'OTHER'
    )),
  verification_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  file_url TEXT,
  verified_by UUID REFERENCES users(user_id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, student_user_id, document_type)
);

CREATE TABLE IF NOT EXISTS grace_marks_policies (
  policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  policy_name VARCHAR(120) NOT NULL,
  scope_type VARCHAR(20) NOT NULL DEFAULT 'UNIVERSITY'
    CHECK (scope_type IN ('UNIVERSITY', 'DEPARTMENT', 'SUBJECT', 'SEMESTER')),
  scope_value VARCHAR(80),
  max_grace_marks NUMERIC(5,2) NOT NULL DEFAULT 5,
  min_shortfall NUMERIC(5,2) NOT NULL DEFAULT 1,
  max_shortfall NUMERIC(5,2) NOT NULL DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS degree_eligibility_audits (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  credits_required INT NOT NULL DEFAULT 160,
  credits_earned INT NOT NULL DEFAULT 0,
  cgpa_required NUMERIC(4,2) NOT NULL DEFAULT 5.0,
  cgpa_earned NUMERIC(4,2),
  pending_backlogs INT NOT NULL DEFAULT 0,
  library_clearance BOOLEAN NOT NULL DEFAULT FALSE,
  finance_clearance BOOLEAN NOT NULL DEFAULT FALSE,
  hostel_clearance BOOLEAN NOT NULL DEFAULT FALSE,
  examination_clearance BOOLEAN NOT NULL DEFAULT FALSE,
  final_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (final_status IN ('PENDING', 'ELIGIBLE', 'NOT_ELIGIBLE')),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_by UUID REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS exam_document_repository (
  repository_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'NOTICE'
    CHECK (category IN ('NOTICE', 'CIRCULAR', 'GUIDELINE', 'QUESTION_PAPER', 'SAMPLE_PAPER', 'RESULT', 'POLICY')),
  file_url TEXT,
  access_roles JSONB NOT NULL DEFAULT '["examcell","examadmin","deputycoe"]'::jsonb,
  uploaded_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_workflow_definitions (
  workflow_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  workflow_key VARCHAR(60) NOT NULL,
  workflow_name VARCHAR(120) NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, workflow_key)
);

-- Default internal marks workflow
INSERT INTO exam_workflow_definitions (tenant_id, workflow_key, workflow_name, steps)
SELECT t.tenant_id, 'INTERNAL_MARKS', 'Internal Marks Approval',
  '[
    {"step": 1, "role": "Faculty", "action": "SUBMIT"},
    {"step": 2, "role": "HOD", "action": "REVIEW"},
    {"step": 3, "role": "COE", "action": "LOCK"}
  ]'::jsonb
FROM tenants t WHERE t.subdomain = 'sgvu'
ON CONFLICT (tenant_id, workflow_key) DO NOTHING;

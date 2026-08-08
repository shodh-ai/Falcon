-- Registrar enterprise desk: placement, lifecycle, certificates, legal, appointments, governance, DSC

-- Academic placement audit
CREATE TABLE IF NOT EXISTS registrar_placement_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  school_name VARCHAR(200),
  department_name VARCHAR(200),
  program_name VARCHAR(200),
  degree_name VARCHAR(120),
  batch VARCHAR(50),
  semester INT,
  section_code VARCHAR(10),
  advisor_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  advisor_name VARCHAR(200),
  changed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  change_source VARCHAR(40) NOT NULL DEFAULT 'MANUAL',
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reg_placement_tenant_student
  ON registrar_placement_history(tenant_id, student_user_id, created_at DESC);

ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS school_name VARCHAR(200);
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS program_name VARCHAR(200);
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS degree_name VARCHAR(120);
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS advisor_user_id UUID;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS advisor_name VARCHAR(200);
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(40);

-- Lifecycle status history
CREATE TABLE IF NOT EXISTS registrar_lifecycle_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  from_status VARCHAR(40),
  to_status VARCHAR(40) NOT NULL,
  remarks TEXT,
  changed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reg_lifecycle_tenant_student
  ON registrar_lifecycle_history(tenant_id, student_user_id, created_at DESC);

-- Certificate desk (beyond convocation DEGREE automation)
CREATE TABLE IF NOT EXISTS registrar_certificate_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  certificate_type VARCHAR(60) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  remarks TEXT,
  pdf_url TEXT,
  signed_at TIMESTAMPTZ,
  issued_at TIMESTAMPTZ,
  signed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  issued_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT registrar_cert_type_check CHECK (
    certificate_type IN (
      'TRANSCRIPT',
      'BONAFIDE',
      'MIGRATION',
      'PROVISIONAL',
      'DUPLICATE_DEGREE',
      'CHARACTER',
      'DEGREE'
    )
  ),
  CONSTRAINT registrar_cert_status_check CHECK (
    status IN ('DRAFT', 'GENERATED', 'SIGNED', 'ISSUED', 'REJECTED', 'CANCELLED')
  )
);
CREATE INDEX IF NOT EXISTS idx_reg_cert_tenant_status
  ON registrar_certificate_requests(tenant_id, status, created_at DESC);

-- Legal & RTI
CREATE TABLE IF NOT EXISTS registrar_rti_requests (
  rti_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  reference_no VARCHAR(80) NOT NULL,
  applicant_name VARCHAR(200) NOT NULL,
  subject TEXT NOT NULL,
  department VARCHAR(200),
  status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
  due_date DATE,
  assigned_to VARCHAR(200),
  reply_summary TEXT,
  created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS registrar_court_cases (
  case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  case_number VARCHAR(120) NOT NULL,
  title TEXT NOT NULL,
  court_name VARCHAR(200),
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  next_hearing DATE,
  counsel VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS registrar_legal_notices (
  notice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  notice_number VARCHAR(120) NOT NULL,
  title TEXT NOT NULL,
  party VARCHAR(200),
  status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS registrar_disciplinary_cases (
  case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  case_number VARCHAR(120) NOT NULL,
  student_name VARCHAR(200),
  allegation TEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
  committee VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Staff appointments
CREATE TABLE IF NOT EXISTS registrar_staff_appointments (
  appointment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  employee_id VARCHAR(40) NOT NULL,
  candidate_name VARCHAR(200) NOT NULL,
  position VARCHAR(200) NOT NULL,
  department VARCHAR(200),
  joining_date DATE,
  salary_package VARCHAR(80),
  recruitment_status VARCHAR(40) NOT NULL DEFAULT 'Selected',
  verification_status VARCHAR(40) NOT NULL DEFAULT 'Pending',
  workflow_stage VARCHAR(60) NOT NULL DEFAULT 'HR',
  reporting_manager VARCHAR(200),
  email VARCHAR(255),
  phone VARCHAR(40),
  salary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  checklist_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  letter_status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reg_appt_tenant_status
  ON registrar_staff_appointments(tenant_id, verification_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS registrar_appointment_activity (
  activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES registrar_staff_appointments(appointment_id) ON DELETE CASCADE,
  event VARCHAR(200) NOT NULL,
  actor VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Governance tasks (production)
CREATE TABLE IF NOT EXISTS registrar_governance_tasks (
  task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(80) NOT NULL,
  body TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  due_date DATE,
  owner_name VARCHAR(200),
  created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  decided_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  decision_remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reg_gov_tenant_status
  ON registrar_governance_tasks(tenant_id, status, updated_at DESC);

-- DSC credentials (metadata only — no private keys)
CREATE TABLE IF NOT EXISTS registrar_dsc_credentials (
  credential_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  owner_name VARCHAR(200) NOT NULL,
  certificate_name VARCHAR(255) NOT NULL,
  certificate_authority VARCHAR(255),
  serial_number VARCHAR(120),
  valid_from DATE,
  expiry_date DATE,
  status VARCHAR(40) NOT NULL DEFAULT 'CONNECTED',
  issued_by VARCHAR(255),
  last_used_at TIMESTAMPTZ,
  signature_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, owner_user_id)
);

CREATE TABLE IF NOT EXISTS registrar_signing_history (
  sign_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  document_label VARCHAR(255) NOT NULL,
  action VARCHAR(120) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'COMPLETED',
  signed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  signed_by_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Semester registration: Registrar remarks + SEND_BACK
ALTER TABLE exam_semester_registrations
  ADD COLUMN IF NOT EXISTS registrar_remarks TEXT;

ALTER TABLE exam_semester_registrations DROP CONSTRAINT IF EXISTS exam_semester_registrations_status_check;
ALTER TABLE exam_semester_registrations
  ADD CONSTRAINT exam_semester_registrations_status_check
  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'SENT_BACK', 'SUBMITTED'));

-- Seed default DSC row helper is application-side (per tenant on first access)

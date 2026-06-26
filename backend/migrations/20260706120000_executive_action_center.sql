-- Executive Action & Control Center — Chairman/Director operational layer

CREATE TABLE IF NOT EXISTS executive_approval_thresholds (
  threshold_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  category VARCHAR(40) NOT NULL,
  auto_approve_below NUMERIC(14,2) NOT NULL DEFAULT 0,
  chairman_approval_above NUMERIC(14,2) NOT NULL DEFAULT 100000,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID NULL REFERENCES users(user_id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, category)
);

CREATE TABLE IF NOT EXISTS executive_fee_waiver_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(user_id),
  waiver_amount NUMERIC(12,2) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  reviewed_by UUID NULL REFERENCES users(user_id),
  reviewed_at TIMESTAMPTZ NULL,
  review_note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS executive_hr_approval_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  request_type VARCHAR(40) NOT NULL
    CHECK (request_type IN ('HIRING', 'PAYROLL_BULK', 'BONUS_ALLOCATION')),
  title VARCHAR(200) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  amount NUMERIC(14,2) NULL,
  requested_by UUID NOT NULL REFERENCES users(user_id),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by UUID NULL REFERENCES users(user_id),
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS executive_academic_approval_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  request_type VARCHAR(40) NOT NULL
    CHECK (request_type IN ('NEW_PROGRAM', 'FEE_STRUCTURE', 'INTAKE_CAPACITY')),
  title VARCHAR(200) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_by UUID NOT NULL REFERENCES users(user_id),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by UUID NULL REFERENCES users(user_id),
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS executive_tasks (
  task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  title VARCHAR(240) NOT NULL,
  description TEXT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'HIGH'
    CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED')),
  assigned_to UUID NOT NULL REFERENCES users(user_id),
  assigned_by UUID NOT NULL REFERENCES users(user_id),
  due_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NULL,
  escalated_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS executive_memos (
  memo_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  subject VARCHAR(240) NOT NULL,
  body TEXT NOT NULL,
  confidential BOOLEAN NOT NULL DEFAULT true,
  audience_roles TEXT[] NOT NULL DEFAULT ARRAY['Dean', 'HOD'],
  sent_by UUID NOT NULL REFERENCES users(user_id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  no_forward BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS executive_memo_recipients (
  recipient_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memo_id UUID NOT NULL REFERENCES executive_memos(memo_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NULL,
  UNIQUE (memo_id, user_id)
);

CREATE TABLE IF NOT EXISTS executive_documents (
  document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  title VARCHAR(240) NOT NULL,
  category VARCHAR(40) NOT NULL
    CHECK (category IN ('LAND_DEED', 'TRUST', 'AFFILIATION', 'LEGAL', 'MOU', 'OTHER')),
  storage_key TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  expires_at DATE NULL,
  uploaded_by UUID NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS executive_document_access_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES executive_documents(document_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id),
  action VARCHAR(20) NOT NULL CHECK (action IN ('VIEW', 'DOWNLOAD', 'UPDATE', 'DELETE')),
  ip_address VARCHAR(64) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS executive_mou_tracker (
  mou_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  partner_name VARCHAR(200) NOT NULL,
  mou_type VARCHAR(40) NOT NULL DEFAULT 'CORPORATE'
    CHECK (mou_type IN ('CORPORATE', 'INTERNATIONAL', 'GOVERNMENT', 'OTHER')),
  signed_on DATE NULL,
  expires_on DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'EXPIRING', 'EXPIRED', 'RENEWED')),
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS executive_broadcasts (
  broadcast_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  subject VARCHAR(240) NOT NULL,
  body TEXT NOT NULL,
  channels TEXT[] NOT NULL DEFAULT ARRAY['EMAIL'],
  audience_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_by UUID NOT NULL REFERENCES users(user_id),
  recipient_count INT NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vip_contacts (
  contact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  full_name VARCHAR(200) NOT NULL,
  organization VARCHAR(200) NULL,
  contact_type VARCHAR(40) NOT NULL DEFAULT 'HNI'
    CHECK (contact_type IN ('HNI', 'POLITICIAN', 'RECRUITER', 'GUEST_LECTURER', 'CSR', 'OTHER')),
  email VARCHAR(255) NULL,
  phone VARCHAR(30) NULL,
  pipeline_stage VARCHAR(30) NOT NULL DEFAULT 'PROSPECTED'
    CHECK (pipeline_stage IN ('PROSPECTED', 'PITCHED', 'PLEDGED', 'RECEIVED', 'DORMANT')),
  pledged_amount NUMERIC(14,2) NULL,
  notes TEXT NULL,
  last_touch_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compliance_calendar_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  title VARCHAR(240) NOT NULL,
  event_type VARCHAR(40) NOT NULL
    CHECK (event_type IN ('INSPECTION', 'TAX_FILING', 'ACCREDITATION', 'AUDIT', 'OTHER')),
  due_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'UPCOMING'
    CHECK (status IN ('UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE')),
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exec_tasks_tenant_status ON executive_tasks(tenant_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_exec_fee_waiver_status ON executive_fee_waiver_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_vip_contacts_stage ON vip_contacts(tenant_id, pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_compliance_calendar_due ON compliance_calendar_events(tenant_id, due_date);

INSERT INTO executive_approval_thresholds (tenant_id, category, auto_approve_below, chairman_approval_above)
SELECT t.tenant_id, c.category, c.auto_below, c.chairman_above
FROM tenants t
CROSS JOIN (VALUES
  ('CAPEX', 1000, 100000),
  ('OPEX', 1000, 100000),
  ('VENDOR_CONTRACT', 1000, 100000),
  ('FEE_WAIVER', 5000, 50000),
  ('SCHOLARSHIP', 10000, 100000),
  ('PAYROLL', 0, 500000)
) AS c(category, auto_below, chairman_above)
ON CONFLICT (tenant_id, category) DO NOTHING;

-- Payslip download requires HR approval + employee reason

CREATE TABLE IF NOT EXISTS staff_payslip_download_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  payslip_id UUID NOT NULL REFERENCES staff_payslips(payslip_id) ON DELETE CASCADE,
  staff_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reviewer_remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payslip_dl_req_tenant_status
  ON staff_payslip_download_requests(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payslip_dl_req_staff_payslip
  ON staff_payslip_download_requests(staff_user_id, payslip_id, created_at DESC);

-- Only one open (pending) request per payslip per employee
CREATE UNIQUE INDEX IF NOT EXISTS uq_payslip_dl_req_pending
  ON staff_payslip_download_requests(payslip_id, staff_user_id)
  WHERE status = 'PENDING';

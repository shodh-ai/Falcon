-- Period-range payslip download requests (1 month to multi-year)

ALTER TABLE staff_payslip_download_requests
  ADD COLUMN IF NOT EXISTS period_from VARCHAR(7),
  ADD COLUMN IF NOT EXISTS period_to VARCHAR(7);

ALTER TABLE staff_payslip_download_requests
  ALTER COLUMN payslip_id DROP NOT NULL;

DROP INDEX IF EXISTS uq_payslip_dl_req_pending;
DROP INDEX IF EXISTS idx_payslip_dl_req_staff_payslip;

CREATE INDEX IF NOT EXISTS idx_payslip_dl_req_staff
  ON staff_payslip_download_requests(staff_user_id, tenant_id, created_at DESC);

-- One pending request per employee at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_payslip_dl_req_staff_pending
  ON staff_payslip_download_requests(staff_user_id, tenant_id)
  WHERE status = 'PENDING';

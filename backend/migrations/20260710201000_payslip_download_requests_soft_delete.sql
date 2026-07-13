-- BaseTenantEntity expects soft-delete column on download requests

ALTER TABLE staff_payslip_download_requests
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

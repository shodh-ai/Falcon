-- Local auth + HR payroll master data fields

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS salary_base NUMERIC(12,2) NULL;

ALTER TABLE staff_payslips ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE staff_payslips ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NULL;
ALTER TABLE staff_payslips ADD COLUMN IF NOT EXISTS gross_pay NUMERIC(12,2) NULL;
ALTER TABLE staff_payslips ADD COLUMN IF NOT EXISTS lwp_days NUMERIC(6,2) NULL;
ALTER TABLE staff_payslips ADD COLUMN IF NOT EXISTS working_days INT NULL;

-- Existing demo payslips are visible to staff
UPDATE staff_payslips SET is_published = TRUE, published_at = COALESCE(published_at, generated_at)
WHERE is_published = FALSE;

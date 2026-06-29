-- hr_employee_profiles was created before KYC columns existed (TypeORM / early schema).
-- finalizeStaffOnboarding writes pan/aadhaar/bank fields on admin approval.

ALTER TABLE hr_employee_profiles
  ADD COLUMN IF NOT EXISTS pan_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS aadhaar_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS ifsc_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS pf_uan VARCHAR(50);

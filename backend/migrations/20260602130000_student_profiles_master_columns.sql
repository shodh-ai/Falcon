-- Extend student_profiles for student portal master data (idempotent)

ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(tenant_id);
UPDATE student_profiles sp
SET tenant_id = u.tenant_id
FROM users u
WHERE sp.user_id = u.user_id AND sp.tenant_id IS NULL;

ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS aadhaar_encrypted TEXT;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS passport_encrypted TEXT;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS category VARCHAR(40);
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS gender VARCHAR(30);
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS nationality VARCHAR(80) DEFAULT 'Indian';
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS admission_type VARCHAR(30);
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS admission_number VARCHAR(80);
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS admission_status VARCHAR(30) DEFAULT 'ACTIVE';
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS migration_certificate_status VARCHAR(30) DEFAULT 'PENDING';
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS final_result VARCHAR(30);
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS no_dues_status VARCHAR(30) DEFAULT 'NOT_STARTED';
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS alumni_conversion_flag BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS degree_issued_at TIMESTAMPTZ;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS degree_award_status VARCHAR(30) DEFAULT 'NOT_ELIGIBLE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_profiles_tenant_admission_number
  ON student_profiles(tenant_id, admission_number)
  WHERE admission_number IS NOT NULL;

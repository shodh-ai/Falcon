-- Falcon HRMS unbundled workspaces: encrypted employee profiles, biometric, pay packages, appraisals.

CREATE TABLE IF NOT EXISTS hr_employee_profiles (
  profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  employee_id VARCHAR(50) NOT NULL,
  designation VARCHAR(140),
  joining_date DATE NOT NULL,
  pan_encrypted TEXT,
  aadhaar_encrypted TEXT,
  bank_account_encrypted TEXT,
  ifsc_code VARCHAR(20),
  pf_uan VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id),
  UNIQUE (tenant_id, employee_id)
);

CREATE TABLE IF NOT EXISTS hr_kyc_reveal_audit (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  revealed_by_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  field_group VARCHAR(40) NOT NULL CHECK (field_group IN ('PAN', 'AADHAAR', 'BANK', 'ALL')),
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_employee_documents (
  document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  document_type VARCHAR(60) NOT NULL,
  file_url TEXT,
  verification_status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_biometric_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  employee_id VARCHAR(50) NOT NULL,
  punch_time TIMESTAMPTZ NOT NULL,
  device_id VARCHAR(50),
  punch_type VARCHAR(10) NOT NULL CHECK (punch_type IN ('IN', 'OUT')),
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_biometric_logs_employee_time
  ON hr_biometric_logs(tenant_id, employee_id, punch_time);

CREATE TABLE IF NOT EXISTS hr_employee_pay_packages (
  package_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  basic_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
  hra NUMERIC(12,2) NOT NULL DEFAULT 0,
  da NUMERIC(12,2) NOT NULL DEFAULT 0,
  pf_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
  tds_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS hr_employee_appraisals (
  appraisal_record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  appraisal_year INT NOT NULL,
  auto_api_score NUMERIC(8,2) NOT NULL DEFAULT 0,
  hod_rating NUMERIC(5,2),
  hr_final_status VARCHAR(50) NOT NULL DEFAULT 'PENDING'
    CHECK (hr_final_status IN ('PENDING', 'HOD_REVIEW', 'HR_APPROVED', 'RETURNED')),
  api_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, user_id, appraisal_year)
);

CREATE INDEX IF NOT EXISTS idx_hr_employee_profiles_employee_id ON hr_employee_profiles(tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_employee_appraisals_year ON hr_employee_appraisals(tenant_id, appraisal_year);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hr_employee_profiles_tenant_id_user_id_key'
  ) THEN
    ALTER TABLE hr_employee_profiles
      ADD CONSTRAINT hr_employee_profiles_tenant_id_user_id_key UNIQUE (tenant_id, user_id);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Backfill employee profiles for existing staff (demo).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hr_employee_profiles' AND column_name = 'entity_id'
  ) THEN
    INSERT INTO hr_employee_profiles (tenant_id, user_id, employee_id, designation, joining_date, entity_id)
    WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
    default_entity AS (
      SELECT o.entity_id
      FROM org_entities o
      JOIN tenant t ON t.tenant_id = o.tenant_id
      ORDER BY o.entity_id
      LIMIT 1
    ),
    staff AS (
      SELECT u.user_id, u.tenant_id, u.name, u.created_at::date AS joined
      FROM users u
      JOIN roles r ON r.role_id = u.role_id
      WHERE r.role_name NOT IN ('Student', 'Applicant', 'Parent')
    )
    SELECT tenant.tenant_id, staff.user_id,
           'SGVU-' || upper(substr(replace(staff.user_id::text, '-', ''), 1, 8)),
           'Faculty', COALESCE(staff.joined, CURRENT_DATE), default_entity.entity_id
    FROM tenant, staff, default_entity
    WHERE default_entity.entity_id IS NOT NULL
    ON CONFLICT (tenant_id, user_id) DO NOTHING;
  ELSE
    INSERT INTO hr_employee_profiles (tenant_id, user_id, employee_id, designation, joining_date)
    WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
    staff AS (
      SELECT u.user_id, u.tenant_id, u.name, u.created_at::date AS joined
      FROM users u
      JOIN roles r ON r.role_id = u.role_id
      WHERE r.role_name NOT IN ('Student', 'Applicant', 'Parent')
    )
    SELECT tenant.tenant_id, staff.user_id,
           'SGVU-' || upper(substr(replace(staff.user_id::text, '-', ''), 1, 8)),
           'Faculty', COALESCE(staff.joined, CURRENT_DATE)
    FROM tenant, staff
    ON CONFLICT (tenant_id, user_id) DO NOTHING;
  END IF;
END $$;

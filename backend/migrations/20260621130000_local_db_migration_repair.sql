-- Idempotent repair for partial local migration state.
-- Safe to run after campus_os_gap_modules; unblocks downstream migrations.

CREATE TABLE IF NOT EXISTS student_exit_clearance_tasks (
  task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  owner_department VARCHAR(40) NOT NULL,
  task_name VARCHAR(180) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CLEARED', 'BLOCKED')),
  remarks TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS placement_companies (
  company_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  company_name VARCHAR(180) NOT NULL,
  hr_name VARCHAR(120) NOT NULL,
  hr_email VARCHAR(255) NOT NULL,
  hr_mobile VARCHAR(20) NULL,
  login_otp_hash VARCHAR(255) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, hr_email)
);

CREATE TABLE IF NOT EXISTS university_assets (
  asset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  asset_tag VARCHAR(80) NOT NULL,
  asset_type VARCHAR(80) NOT NULL,
  name VARCHAR(180) NOT NULL,
  assigned_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  assigned_room VARCHAR(80) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, asset_tag)
);

CREATE TABLE IF NOT EXISTS fleet_vehicles (
  vehicle_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  registration_no VARCHAR(40) NOT NULL,
  vehicle_type VARCHAR(40) NOT NULL DEFAULT 'BUS',
  driver_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  route_zone VARCHAR(120) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  UNIQUE (tenant_id, registration_no)
);

CREATE TABLE IF NOT EXISTS transport_routes (
  route_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  route_name VARCHAR(100) NOT NULL,
  vehicle_id UUID REFERENCES fleet_vehicles(vehicle_id) ON DELETE SET NULL,
  driver_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  total_seats INT NOT NULL DEFAULT 40,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ufm_cases (
  case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  student_user_id UUID REFERENCES users(user_id),
  exam_id UUID REFERENCES exam_schedules(exam_schedule_id),
  description TEXT,
  penalty_applied VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'CLOSED')),
  logged_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS alumni_id UUID DEFAULT gen_random_uuid();
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS current_company VARCHAR(180);
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS current_organization VARCHAR(180);
ALTER TABLE alumni_profiles ALTER COLUMN alumni_id SET DEFAULT gen_random_uuid();
UPDATE alumni_profiles SET alumni_id = gen_random_uuid() WHERE alumni_id IS NULL;

ALTER TABLE hr_employee_profiles ADD COLUMN IF NOT EXISTS entity_id UUID;

DO $$
BEGIN
  IF to_regclass('public.org_entities') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'hr_employee_profiles' AND column_name = 'entity_id'
     ) THEN
    UPDATE hr_employee_profiles hep
    SET entity_id = sub.entity_id
    FROM (
      SELECT oe.entity_id
      FROM org_entities oe
      JOIN tenants t ON t.tenant_id = oe.tenant_id
      WHERE t.subdomain = 'sgvu' AND oe.is_active = true
      ORDER BY oe.entity_id
      LIMIT 1
    ) sub
    WHERE hep.entity_id IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.finance_ledger_accounts') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_ledger_accounts_tenant_code
      ON finance_ledger_accounts(tenant_id, account_code);
  END IF;
  IF to_regclass('public.finance_expense_heads') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_expense_heads_tenant_code
      ON finance_expense_heads(tenant_id, head_code);
  END IF;
END $$;

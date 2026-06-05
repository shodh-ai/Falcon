-- Multi-entity HRMS foundation: org entities, permissions matrix, shift allocations,
-- attendance rules engine, penalty trackers, policies, onboarding/offboarding workflows.

-- ---------------------------------------------------------------------------
-- 1. Org entities (within a tenant)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_entities (
  entity_id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  entity_code VARCHAR(40) NOT NULL,
  entity_name VARCHAR(120) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, entity_code)
);

CREATE INDEX IF NOT EXISTS idx_org_entities_tenant ON org_entities(tenant_id);

-- ---------------------------------------------------------------------------
-- 2. Granular HR permissions (per HR user, JSON capabilities)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_permissions (
  permission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 3. Entity scope on existing HR tables
-- ---------------------------------------------------------------------------
ALTER TABLE hr_employee_profiles ADD COLUMN IF NOT EXISTS entity_id INT NULL REFERENCES org_entities(entity_id);
ALTER TABLE hr_shifts ADD COLUMN IF NOT EXISTS entity_id INT NULL REFERENCES org_entities(entity_id);
ALTER TABLE hr_holidays ADD COLUMN IF NOT EXISTS entity_id INT NULL REFERENCES org_entities(entity_id);
ALTER TABLE hr_job_postings ADD COLUMN IF NOT EXISTS entity_id INT NULL REFERENCES org_entities(entity_id);
ALTER TABLE hr_applicants ADD COLUMN IF NOT EXISTS entity_id INT NULL REFERENCES org_entities(entity_id);
ALTER TABLE hr_clearance_tasks ADD COLUMN IF NOT EXISTS entity_id INT NULL REFERENCES org_entities(entity_id);
ALTER TABLE hr_salary_structures ADD COLUMN IF NOT EXISTS entity_id INT NULL REFERENCES org_entities(entity_id);
ALTER TABLE hr_payroll_runs ADD COLUMN IF NOT EXISTS entity_id INT NULL REFERENCES org_entities(entity_id);
ALTER TABLE hr_employee_pay_packages ADD COLUMN IF NOT EXISTS entity_id INT NULL REFERENCES org_entities(entity_id);
ALTER TABLE hr_employee_documents ADD COLUMN IF NOT EXISTS entity_id INT NULL REFERENCES org_entities(entity_id);
ALTER TABLE hr_biometric_logs ADD COLUMN IF NOT EXISTS entity_id INT NULL REFERENCES org_entities(entity_id);

CREATE INDEX IF NOT EXISTS idx_hr_employee_profiles_entity ON hr_employee_profiles(tenant_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_hr_shifts_entity ON hr_shifts(entity_id);

-- ---------------------------------------------------------------------------
-- 4. Shift allocations (dept or user override)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_shift_allocations (
  allocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  entity_id INT NOT NULL REFERENCES org_entities(entity_id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES hr_shifts(shift_id) ON DELETE CASCADE,
  department_id INT NULL REFERENCES departments(dept_id) ON DELETE CASCADE,
  user_id UUID NULL REFERENCES users(user_id) ON DELETE CASCADE,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (department_id IS NOT NULL OR user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_hr_shift_allocations_lookup
  ON hr_shift_allocations(tenant_id, entity_id, user_id, department_id, effective_from);

-- ---------------------------------------------------------------------------
-- 5. Attendance rules engine (configurable per entity)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_attendance_rules (
  rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  entity_id INT NOT NULL REFERENCES org_entities(entity_id) ON DELETE CASCADE,
  allowed_early_goings INT NOT NULL DEFAULT 3,
  early_going_max_mins INT NOT NULL DEFAULT 20,
  allowed_late_comings INT NOT NULL DEFAULT 3,
  late_coming_max_mins INT NOT NULL DEFAULT 15,
  penalty_on_exceed_type VARCHAR(50) NOT NULL DEFAULT 'RETROACTIVE_HALF_DAY'
    CHECK (penalty_on_exceed_type IN ('RETROACTIVE_HALF_DAY', 'DEDUCT_LEAVE', 'DEDUCT_SALARY')),
  retroactive_penalty_days NUMERIC(4,2) NOT NULL DEFAULT 2.0,
  updated_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, entity_id)
);

-- ---------------------------------------------------------------------------
-- 6. Monthly penalty tracker
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_penalty_trackers (
  tracker_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  entity_id INT NOT NULL REFERENCES org_entities(entity_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  month_year VARCHAR(10) NOT NULL,
  early_goings_count INT NOT NULL DEFAULT 0,
  late_comings_count INT NOT NULL DEFAULT 0,
  deduction_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  penalty_dates JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, entity_id, user_id, month_year)
);

-- ---------------------------------------------------------------------------
-- 7. Payroll deduction ledger (consumed by payroll run)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_payroll_deductions (
  deduction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  entity_id INT NOT NULL REFERENCES org_entities(entity_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  month_year VARCHAR(10) NOT NULL,
  deduction_type VARCHAR(60) NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  days_deducted NUMERIC(4,2) NOT NULL DEFAULT 0.00,
  reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_payroll_deductions_month
  ON hr_payroll_deductions(tenant_id, entity_id, user_id, month_year);

-- ---------------------------------------------------------------------------
-- 8. Onboarding pipeline
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_onboarding_pipelines (
  pipeline_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  entity_id INT NOT NULL REFERENCES org_entities(entity_id) ON DELETE CASCADE,
  applicant_id UUID NULL REFERENCES hr_applicants(applicant_id) ON DELETE SET NULL,
  user_id UUID NULL REFERENCES users(user_id) ON DELETE CASCADE,
  stage VARCHAR(40) NOT NULL DEFAULT 'DOCUMENTS'
    CHECK (stage IN ('DOCUMENTS', 'OFFER', 'POLICIES', 'ID_CARD', 'COMPLETED')),
  progress_percent INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_onboarding_steps (
  step_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES hr_onboarding_pipelines(pipeline_id) ON DELETE CASCADE,
  step_key VARCHAR(40) NOT NULL,
  step_label VARCHAR(120) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED')),
  completed_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE (pipeline_id, step_key)
);

-- ---------------------------------------------------------------------------
-- 9. Resignation / offboarding workflow
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_resignation_requests (
  resignation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  entity_id INT NOT NULL REFERENCES org_entities(entity_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  last_working_day DATE NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING_HOD'
    CHECK (status IN (
      'PENDING_HOD', 'HOD_CLEARED', 'PENDING_HR', 'HR_PROCESSING',
      'FNF_PENDING', 'FNF_COMPLETED', 'REJECTED', 'WITHDRAWN'
    )),
  hod_cleared_by UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  hod_cleared_at TIMESTAMPTZ NULL,
  hr_processed_by UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  hr_processed_at TIMESTAMPTZ NULL,
  separation_mode VARCHAR(40) NULL
    CHECK (separation_mode IS NULL OR separation_mode IN (
      'SERVE_NOTICE', 'BUYOUT_NOTICE', 'IMMEDIATE_SEPARATION'
    )),
  fnf_ledger_ref VARCHAR(80) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_resignation_status
  ON hr_resignation_requests(tenant_id, entity_id, status);

-- ---------------------------------------------------------------------------
-- 10. Policy CMS + acknowledgements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_policy_documents (
  policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  entity_id INT NOT NULL REFERENCES org_entities(entity_id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  category VARCHAR(60) NOT NULL DEFAULT 'GENERAL',
  file_url TEXT NULL,
  version VARCHAR(20) NOT NULL DEFAULT '1.0',
  is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS hr_policy_acknowledgements (
  ack_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES hr_policy_documents(policy_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address VARCHAR(64) NULL,
  UNIQUE (policy_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 11. Seed SGVU entities + default rules + 14 shifts
-- ---------------------------------------------------------------------------
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
)
INSERT INTO org_entities (tenant_id, entity_code, entity_name)
SELECT tenant.tenant_id, data.code, data.name
FROM tenant
CROSS JOIN (VALUES
  ('SGVU_UNIVERSITY', 'SGVU University'),
  ('WORLD_SCHOOL', 'World School'),
  ('PLAY_SCHOOL', 'Play School')
) AS data(code, name)
ON CONFLICT (tenant_id, entity_code) DO NOTHING;

WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
default_entity AS (
  SELECT entity_id, tenant_id FROM org_entities
  WHERE entity_code = 'SGVU_UNIVERSITY'
  LIMIT 1
)
INSERT INTO hr_attendance_rules (
  tenant_id, entity_id, allowed_early_goings, early_going_max_mins,
  allowed_late_comings, late_coming_max_mins, penalty_on_exceed_type, retroactive_penalty_days
)
SELECT de.tenant_id, de.entity_id, 3, 20, 3, 15, 'RETROACTIVE_HALF_DAY', 2.0
FROM default_entity de
ON CONFLICT (tenant_id, entity_id) DO NOTHING;

-- Backfill entity_id on existing HR rows
WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
default_entity AS (
  SELECT entity_id FROM org_entities o
  JOIN tenant t ON t.tenant_id = o.tenant_id
  WHERE o.entity_code = 'SGVU_UNIVERSITY' LIMIT 1
)
UPDATE hr_employee_profiles ep
SET entity_id = (SELECT entity_id FROM default_entity)
WHERE ep.entity_id IS NULL;

WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
default_entity AS (
  SELECT entity_id FROM org_entities o
  JOIN tenant t ON t.tenant_id = o.tenant_id
  WHERE o.entity_code = 'SGVU_UNIVERSITY' LIMIT 1
)
UPDATE hr_shifts s
SET entity_id = (SELECT entity_id FROM default_entity)
WHERE s.entity_id IS NULL;

-- Seed 14 shifts for SGVU University entity
WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
ent AS (
  SELECT entity_id FROM org_entities o
  JOIN tenant t ON t.tenant_id = o.tenant_id
  WHERE o.entity_code = 'SGVU_UNIVERSITY' LIMIT 1
)
INSERT INTO hr_shifts (shift_name, start_time, end_time, grace_period_mins, half_day_min_hours, full_day_min_hours, entity_id)
SELECT data.name, data.start_t::time, data.end_t::time, data.grace, 4.0, 8.0, ent.entity_id
FROM ent
CROSS JOIN (VALUES
  ('Morning 7-3', '07:00', '15:00', 10),
  ('Morning 8-4', '08:00', '16:00', 10),
  ('Morning 9-5', '09:00', '17:00', 5),
  ('Late 10-6', '10:00', '18:00', 10),
  ('Late 11-7', '11:00', '19:00', 10),
  ('Afternoon 12-8', '12:00', '20:00', 10),
  ('Evening 2-10', '14:00', '22:00', 10),
  ('Night 10-6', '22:00', '06:00', 15),
  ('Split A 9-1+2-6', '09:00', '18:00', 10),
  ('Split B 8-12+1-5', '08:00', '17:00', 10),
  ('Faculty 9-4', '09:00', '16:00', 15),
  ('Admin 9-6', '09:00', '18:00', 10),
  ('Security 6-2', '06:00', '14:00', 10),
  ('Lab 10-7', '10:00', '19:00', 10)
) AS data(name, start_t, end_t, grace)
WHERE NOT EXISTS (
  SELECT 1 FROM hr_shifts existing
  WHERE existing.shift_name = data.name AND existing.entity_id = ent.entity_id
);

-- Default attendance rules for all entities
INSERT INTO hr_attendance_rules (tenant_id, entity_id, allowed_early_goings, early_going_max_mins)
SELECT o.tenant_id, o.entity_id, 3, 20
FROM org_entities o
ON CONFLICT (tenant_id, entity_id) DO NOTHING;

-- Sample policy documents
WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
ent AS (
  SELECT entity_id FROM org_entities o JOIN tenant t ON t.tenant_id = o.tenant_id
  WHERE o.entity_code = 'SGVU_UNIVERSITY' LIMIT 1
)
INSERT INTO hr_policy_documents (tenant_id, entity_id, title, category, file_url, is_mandatory)
SELECT t.tenant_id, e.entity_id, data.title, data.cat, data.url, TRUE
FROM tenant t, ent e
CROSS JOIN (VALUES
  ('Leave Policy 2026', 'LEAVE', '/policies/leave-policy-2026.pdf'),
  ('POSH Act Guidelines', 'COMPLIANCE', '/policies/posh-act.pdf'),
  ('Travel Allowance Policy', 'TRAVEL', '/policies/travel-allowance.pdf')
) AS data(title, cat, url)
WHERE NOT EXISTS (
  SELECT 1 FROM hr_policy_documents p WHERE p.title = data.title AND p.entity_id = e.entity_id
);

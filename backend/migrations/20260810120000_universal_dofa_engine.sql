-- Universal DOFA Engine (middle-layer nervous system)

CREATE TABLE IF NOT EXISTS dofa_matrices (
  matrix_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  domain VARCHAR(40) NOT NULL,
  rule_key VARCHAR(80) NOT NULL DEFAULT 'DEFAULT',
  amount_min NUMERIC(14,2),
  amount_max NUMERIC(14,2),
  required_roles TEXT[] NOT NULL,
  required_signatures INT NOT NULL DEFAULT 1,
  exception_escalate_role VARCHAR(40) NOT NULL DEFAULT 'Chairman',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, domain, rule_key, amount_min, amount_max)
);

CREATE TABLE IF NOT EXISTS dofa_cases (
  case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  domain VARCHAR(40) NOT NULL,
  source_table VARCHAR(80),
  source_id VARCHAR(80),
  requester_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  amount NUMERIC(14,2),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  current_step INT NOT NULL DEFAULT 0,
  matrix_id UUID REFERENCES dofa_matrices(matrix_id) ON DELETE SET NULL,
  exception_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dofa_cases_tenant_status ON dofa_cases(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_dofa_cases_domain ON dofa_cases(tenant_id, domain);

CREATE TABLE IF NOT EXISTS dofa_case_steps (
  step_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES dofa_cases(case_id) ON DELETE CASCADE,
  step_no INT NOT NULL,
  required_role VARCHAR(40) NOT NULL,
  decided_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  decision VARCHAR(20),
  notes TEXT,
  decided_at TIMESTAMPTZ,
  UNIQUE (case_id, step_no)
);

CREATE TABLE IF NOT EXISTS hr_headcount_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(user_id),
  job_title TEXT NOT NULL,
  department TEXT,
  ctc_annual NUMERIC(14,2) NOT NULL,
  candidate_email TEXT,
  candidate_name TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING_DOFA',
  dofa_case_id UUID REFERENCES dofa_cases(case_id) ON DELETE SET NULL,
  offer_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed matrices for sgvu (and NULL tenant = global defaults)
DO $$
DECLARE tid UUID;
BEGIN
  SELECT tenant_id INTO tid FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;

  INSERT INTO dofa_matrices (tenant_id, domain, rule_key, amount_min, amount_max, required_roles, required_signatures, exception_escalate_role)
  SELECT tid, v.domain, v.rule_key, v.amin, v.amax, v.roles, v.sigs, v.esc
  FROM (VALUES
    ('HR_HIRE', 'UNDER_15L', 0::numeric, 1499999.99::numeric,
      ARRAY['Dean','HR','CFO']::text[], 3, 'Chairman'),
    ('HR_HIRE', 'OVER_15L', 1500000::numeric, NULL::numeric,
      ARRAY['Chairman']::text[], 1, 'Chairman'),
    ('GRADE_CHANGE', 'DEFAULT', NULL::numeric, NULL::numeric,
      ARRAY['HOD','ExamCell']::text[], 2, 'Chairman'),
    ('ASSET_WRITEOFF', 'HEAVY', NULL::numeric, NULL::numeric,
      ARRAY['COO','CFO']::text[], 2, 'Chairman'),
    ('ESM_EXCEPTION', 'SLA_10D', NULL::numeric, NULL::numeric,
      ARRAY['Chairman']::text[], 1, 'Chairman'),
    ('MOU', 'DEFAULT', NULL::numeric, NULL::numeric,
      ARRAY['LegalOfficer','Dean','President']::text[], 3, 'Chairman'),
    ('SPACE', 'DEFAULT', NULL::numeric, NULL::numeric,
      ARRAY['Faculty','EstateOfficer','Security']::text[], 3, 'Chairman')
  ) AS v(domain, rule_key, amin, amax, roles, sigs, esc)
  WHERE tid IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM dofa_matrices m
      WHERE m.tenant_id = tid AND m.domain = v.domain AND m.rule_key = v.rule_key
    );
END $$;

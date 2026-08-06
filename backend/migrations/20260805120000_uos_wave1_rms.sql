-- UOS Wave 1: RMS — Research Grants & IP + P2P grant gate

INSERT INTO roles (role_name, description)
VALUES
  ('DeanOfResearch', 'Dean of Research — institutional commitment on external grants')
ON CONFLICT (role_name) DO UPDATE SET description = EXCLUDED.description;

ALTER TABLE research_grants
  ADD COLUMN IF NOT EXISTS agency VARCHAR(30),
  ADD COLUMN IF NOT EXISTS allowed_expense_categories TEXT[] NOT NULL DEFAULT ARRAY['EQUIPMENT','CONSUMABLES','TRAVEL','MANPOWER','CONTINGENCY'],
  ADD COLUMN IF NOT EXISTS available_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS dor_approved_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dor_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proposal_abstract TEXT,
  ADD COLUMN IF NOT EXISTS expense_category_default VARCHAR(50) DEFAULT 'EQUIPMENT';

-- Backfill agency from funding_agency; available_amount from sanctioned - utilized
UPDATE research_grants
SET agency = COALESCE(agency, CASE
      WHEN upper(funding_agency) LIKE '%SERB%' THEN 'SERB'
      WHEN upper(funding_agency) LIKE '%DST%' THEN 'DST'
      WHEN upper(funding_agency) LIKE '%AICTE%' THEN 'AICTE'
      WHEN upper(funding_agency) LIKE '%PRIVATE%' THEN 'PRIVATE'
      ELSE 'OTHER'
    END),
    available_amount = COALESCE(available_amount, GREATEST(0, sanctioned_amount - utilized_amount))
WHERE true;

CREATE TABLE IF NOT EXISTS research_grant_proposals (
  proposal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  pi_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  agency VARCHAR(30) NOT NULL DEFAULT 'DST',
  requested_amount NUMERIC(14,2) NOT NULL,
  abstract TEXT,
  allowed_expense_categories TEXT[] NOT NULL DEFAULT ARRAY['EQUIPMENT','CONSUMABLES','TRAVEL','MANPOWER','CONTINGENCY'],
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  grant_id UUID REFERENCES research_grants(grant_id) ON DELETE SET NULL,
  dor_notes TEXT,
  decided_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_grant_proposals_tenant_status
  ON research_grant_proposals(tenant_id, status);

CREATE TABLE IF NOT EXISTS research_ip_docket (
  ip_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  ip_type VARCHAR(30) NOT NULL DEFAULT 'PATENT',
  status VARCHAR(30) NOT NULL DEFAULT 'DISCLOSURE',
  inventors TEXT,
  grant_id UUID REFERENCES research_grants(grant_id) ON DELETE SET NULL,
  filed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  filing_ref VARCHAR(120),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fin_purchase_requisitions
  ADD COLUMN IF NOT EXISTS grant_id UUID REFERENCES research_grants(grant_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS grant_expense_category VARCHAR(50);

ALTER TABLE fin_purchase_orders
  ADD COLUMN IF NOT EXISTS grant_id UUID REFERENCES research_grants(grant_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS grant_expense_category VARCHAR(50);

ALTER TABLE research_grant_expenses
  ADD COLUMN IF NOT EXISTS po_id UUID REFERENCES fin_purchase_orders(po_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE CASCADE;

-- Persona: Dean of Research
WITH tenant AS (
  SELECT tenant_id FROM tenants WHERE subdomain = 'sgvu' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id,
  password_hash, salary_base, onboarding_status, is_active
)
SELECT
  'c4000001-cccc-4000-8000-000000000001'::uuid,
  t.tenant_id,
  'Dean of Research',
  'dean.research@mygyanvihar.com',
  r.role_id,
  pwd.hash,
  120000.00,
  'ACTIVE',
  true
FROM tenant t
CROSS JOIN pwd
JOIN roles r ON r.role_name = 'DeanOfResearch'
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  password_hash = EXCLUDED.password_hash,
  onboarding_status = 'ACTIVE',
  is_active = true;

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u
JOIN tenants t ON t.tenant_id = u.tenant_id AND t.subdomain = 'sgvu'
WHERE lower(u.official_email) = 'dean.research@mygyanvihar.com'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

-- Sample ACTIVE SERB grant for QA (PI = labadmin if present)
INSERT INTO research_grants (
  tenant_id, principal_investigator_id, funding_agency, agency, grant_title,
  sanctioned_amount, utilized_amount, available_amount, status,
  allowed_expense_categories, start_date, end_date
)
SELECT t.tenant_id, u.user_id, 'SERB', 'SERB',
  'SERB Core Research — Deep Tech Instrumentation',
  5000000.00, 0, 5000000.00, 'ACTIVE',
  ARRAY['EQUIPMENT','CONSUMABLES','MANPOWER'],
  CURRENT_DATE - 30, CURRENT_DATE + 700
FROM tenants t
CROSS JOIN users u
WHERE t.subdomain = 'sgvu'
  AND lower(u.official_email) = 'labadmin@mygyanvihar.com'
  AND NOT EXISTS (
    SELECT 1 FROM research_grants g
    WHERE g.tenant_id = t.tenant_id AND g.grant_title LIKE 'SERB Core Research%'
  )
LIMIT 1;

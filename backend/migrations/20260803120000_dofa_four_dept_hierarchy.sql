-- Digital DOFA v2: Four departments + five-level hierarchy

INSERT INTO roles (role_name, description)
VALUES
  ('Procurement', 'Central procurement buyer — sources quotes, no request/pay'),
  ('ProcurementHead', 'Procurement head — L3 joint committee co-signer'),
  ('FinanceController', 'Finance controller — L3 co-signer + AP oversight'),
  ('Warden', 'Hostel warden — requestor for facilities consumables')
ON CONFLICT (role_name) DO UPDATE
SET description = EXCLUDED.description;

-- Ensure Stores/Security exist
INSERT INTO roles (role_name, description)
VALUES
  ('Stores', 'Campus stores / goods receipt receiver'),
  ('Security', 'Gate security for goods receipt')
ON CONFLICT (role_name) DO UPDATE
SET description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS fin_dofa_levels (
  level_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  level_no INT NOT NULL CHECK (level_no BETWEEN 1 AND 5),
  label TEXT NOT NULL,
  max_amount_inr NUMERIC(15,2), -- NULL = no upper bound (Level 5)
  required_roles TEXT[] NOT NULL,
  required_signatures INT NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, level_no)
);

CREATE TABLE IF NOT EXISTS fin_pr_approvals (
  approval_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id UUID NOT NULL REFERENCES fin_purchase_requisitions(pr_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  level_no INT NOT NULL,
  approver_user_id UUID REFERENCES users(user_id),
  approver_role VARCHAR(64) NOT NULL,
  decision VARCHAR(20) NOT NULL DEFAULT 'APPROVED',
  notes TEXT,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pr_id, level_no, approver_role)
);

ALTER TABLE fin_purchase_requisitions
  ADD COLUMN IF NOT EXISTS required_level INT,
  ADD COLUMN IF NOT EXISTS sourcing_by UUID REFERENCES users(user_id),
  ADD COLUMN IF NOT EXISTS locked_quote_id UUID,
  ADD COLUMN IF NOT EXISTS budget_ok BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS technical_specs TEXT,
  ADD COLUMN IF NOT EXISTS program_id UUID,
  ADD COLUMN IF NOT EXISTS budget_id UUID;

ALTER TABLE fin_goods_receipts
  ADD COLUMN IF NOT EXISTS asset_barcode VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_fin_pr_approvals_pr
  ON fin_pr_approvals(pr_id, level_no);
CREATE INDEX IF NOT EXISTS idx_fin_pr_required_level
  ON fin_purchase_requisitions(tenant_id, required_level, status);

DO $$
DECLARE tid UUID;
BEGIN
  SELECT tenant_id INTO tid FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF tid IS NULL THEN SELECT tenant_id INTO tid FROM tenants LIMIT 1; END IF;
  IF tid IS NULL THEN RETURN; END IF;

  -- Five-level DOFA matrix
  INSERT INTO fin_dofa_levels (tenant_id, level_no, label, max_amount_inr, required_roles, required_signatures)
  SELECT tid, v.level_no, v.label, v.max_a, v.roles, v.sigs
  FROM (VALUES
    (1, 'HOD / Lab Director', 50000::numeric, ARRAY['HOD','LabAdmin']::text[], 1),
    (2, 'Dean / Campus Director', 200000::numeric, ARRAY['Dean','CampusAdmin']::text[], 1),
    (3, 'Joint Committee (Procurement Head + Finance Controller)', 500000::numeric, ARRAY['ProcurementHead','FinanceController']::text[], 2),
    (4, 'COO / VP Operations', 1500000::numeric, ARRAY['COO']::text[], 1),
    (5, 'Chairman / CEO', NULL::numeric, ARRAY['Chairman','President']::text[], 1)
  ) AS v(level_no, label, max_a, roles, sigs)
  ON CONFLICT (tenant_id, level_no) DO UPDATE SET
    label = EXCLUDED.label,
    max_amount_inr = EXCLUDED.max_amount_inr,
    required_roles = EXCLUDED.required_roles,
    required_signatures = EXCLUDED.required_signatures;

  -- Compat: update fin_dofa_rules display limits to match matrix caps
  UPDATE fin_dofa_rules SET max_amount_inr = 50000 WHERE tenant_id = tid AND role_name = 'HOD';
  UPDATE fin_dofa_rules SET max_amount_inr = 50000 WHERE tenant_id = tid AND role_name = 'LabAdmin';
  UPDATE fin_dofa_rules SET max_amount_inr = 1500000 WHERE tenant_id = tid AND role_name = 'COO';

  INSERT INTO fin_dofa_rules (tenant_id, role_name, max_amount_inr)
  SELECT tid, v.role_name, v.max_a
  FROM (VALUES
    ('Dean', 200000::numeric),
    ('CampusAdmin', 200000::numeric),
    ('ProcurementHead', 500000::numeric),
    ('FinanceController', 500000::numeric),
    ('Chairman', 999999999::numeric)
  ) AS v(role_name, max_a)
  WHERE NOT EXISTS (
    SELECT 1 FROM fin_dofa_rules r WHERE r.tenant_id = tid AND r.role_name = v.role_name
  );
END $$;

-- QA personas (password: password123)
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
persona AS (
  SELECT * FROM (VALUES
    ('Procurement', 'Central Procurement Buyer', 'procurement@mygyanvihar.com', 'c2000001-aaaa-4000-8000-000000000001'::uuid),
    ('ProcurementHead', 'Procurement Head', 'prochead@mygyanvihar.com', 'c2000002-aaaa-4000-8000-000000000002'::uuid),
    ('FinanceController', 'Finance Controller', 'fincontroller@mygyanvihar.com', 'c2000003-aaaa-4000-8000-000000000003'::uuid),
    ('Stores', 'Central Stores Manager', 'stores@mygyanvihar.com', 'c2000004-aaaa-4000-8000-000000000004'::uuid),
    ('Security', 'Gate Security', 'security@mygyanvihar.com', 'c2000005-aaaa-4000-8000-000000000005'::uuid),
    ('Dean', 'Dean Approver', 'dean.dofa@mygyanvihar.com', 'c2000006-aaaa-4000-8000-000000000006'::uuid)
  ) AS v(role_name, display_name, email, user_id)
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id,
  password_hash, salary_base, onboarding_status, is_active
)
SELECT
  p.user_id,
  t.tenant_id,
  p.display_name,
  p.email,
  r.role_id,
  pwd.hash,
  85000.00,
  'ACTIVE',
  true
FROM persona p
CROSS JOIN tenant t
CROSS JOIN pwd
JOIN roles r ON r.role_name = p.role_name
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  password_hash = EXCLUDED.password_hash,
  onboarding_status = 'ACTIVE',
  is_active = true;

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u
JOIN public.tenants t ON t.tenant_id = u.tenant_id AND t.subdomain = 'sgvu'
WHERE lower(u.official_email) IN (
  'procurement@mygyanvihar.com',
  'prochead@mygyanvihar.com',
  'fincontroller@mygyanvihar.com',
  'stores@mygyanvihar.com',
  'security@mygyanvihar.com',
  'dean.dofa@mygyanvihar.com'
)
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

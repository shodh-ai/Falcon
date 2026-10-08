-- Three-pillar org hierarchy: Academic / Operations / Finance

INSERT INTO roles (role_name, description)
VALUES
  ('CFO', 'Chief Financial Officer — Finance pillar head'),
  ('APManager', 'Accounts Payable Manager — 3-way match approver'),
  ('APClerk', 'AP Clerk — remittance / NEFT execution'),
  ('InternalAuditor', 'Internal Auditor — reports to Chairman, fraud oversight'),
  ('ProcurementBuyer', 'Category buyer under Procurement Head'),
  ('HelpdeskDispatcher', 'ESM helpdesk dispatcher under Facilities'),
  ('ReceivingClerk', 'Stores receiving clerk at gate/godown')
ON CONFLICT (role_name) DO UPDATE SET description = EXCLUDED.description;

ALTER TABLE fin_vendor_penalties
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settled_po_id UUID REFERENCES fin_purchase_orders(po_id) ON DELETE SET NULL;

-- Pillar org units
DO $$
DECLARE tid UUID;
DECLARE eid INT;
BEGIN
  SELECT tenant_id INTO tid FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF tid IS NULL THEN RETURN; END IF;
  SELECT entity_id INTO eid FROM org_entities WHERE tenant_id = tid ORDER BY entity_id LIMIT 1;
  IF eid IS NULL THEN SELECT entity_id INTO eid FROM org_entities ORDER BY entity_id LIMIT 1; END IF;
  IF eid IS NULL THEN RETURN; END IF;

  INSERT INTO hr_org_units (tenant_id, entity_id, parent_id, unit_type, unit_name, sort_order)
  SELECT tid, eid, NULL, v.utype, v.uname, v.ord
  FROM (VALUES
    ('PILLAR', 'ACADEMIC', 1),
    ('PILLAR', 'OPERATIONS', 2),
    ('PILLAR', 'FINANCE', 3)
  ) AS v(utype, uname, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM hr_org_units u
    WHERE u.tenant_id = tid AND u.unit_type = 'PILLAR' AND u.unit_name = v.uname
  );
END $$;

-- New personas
WITH tenant AS (
  SELECT tenant_id FROM tenants WHERE subdomain = 'sgvu' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
persona AS (
  SELECT * FROM (VALUES
    ('CFO', 'Chief Financial Officer', 'cfo@mygyanvihar.com', 'c3000001-bbbb-4000-8000-000000000001'::uuid),
    ('APManager', 'AP Manager', 'apmanager@mygyanvihar.com', 'c3000002-bbbb-4000-8000-000000000002'::uuid),
    ('APClerk', 'AP Clerk', 'apclerk@mygyanvihar.com', 'c3000003-bbbb-4000-8000-000000000003'::uuid),
    ('InternalAuditor', 'Internal Auditor', 'auditor@mygyanvihar.com', 'c3000004-bbbb-4000-8000-000000000004'::uuid),
    ('ProcurementBuyer', 'Buyer IT & Deep Tech', 'buyer.it@mygyanvihar.com', 'c3000005-bbbb-4000-8000-000000000005'::uuid),
    ('ProcurementBuyer', 'Buyer Facilities & Consumables', 'buyer.facilities@mygyanvihar.com', 'c3000006-bbbb-4000-8000-000000000006'::uuid),
    ('HelpdeskDispatcher', 'Helpdesk Dispatcher', 'helpdesk.dispatch@mygyanvihar.com', 'c3000007-bbbb-4000-8000-000000000007'::uuid),
    ('ReceivingClerk', 'Receiving Clerk', 'receiving@mygyanvihar.com', 'c3000008-bbbb-4000-8000-000000000008'::uuid)
  ) AS v(role_name, display_name, email, user_id)
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id,
  password_hash, salary_base, onboarding_status, is_active
)
SELECT p.user_id, t.tenant_id, p.display_name, p.email, r.role_id, pwd.hash, 90000.00, 'ACTIVE', true
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
JOIN tenants t ON t.tenant_id = u.tenant_id AND t.subdomain = 'sgvu'
WHERE lower(u.official_email) IN (
  'cfo@mygyanvihar.com', 'apmanager@mygyanvihar.com', 'apclerk@mygyanvihar.com',
  'auditor@mygyanvihar.com', 'buyer.it@mygyanvihar.com', 'buyer.facilities@mygyanvihar.com',
  'helpdesk.dispatch@mygyanvihar.com', 'receiving@mygyanvihar.com'
)
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

-- Reporting lines (anti-collusion)
DO $$
DECLARE
  v_chairman UUID;
  v_coo UUID;
  v_president UUID;
  v_prochead UUID;
  v_stores UUID;
  v_cfo UUID;
  v_apmgr UUID;
  v_estate UUID;
  v_dean UUID;
BEGIN
  SELECT user_id INTO v_chairman FROM users WHERE lower(official_email) = 'chairman@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_coo FROM users WHERE lower(official_email) = 'coo@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_president FROM users WHERE lower(official_email) = 'president@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_prochead FROM users WHERE lower(official_email) = 'prochead@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_stores FROM users WHERE lower(official_email) = 'stores@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_cfo FROM users WHERE lower(official_email) = 'cfo@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_apmgr FROM users WHERE lower(official_email) = 'apmanager@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_estate FROM users WHERE lower(official_email) = 'estate@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_dean FROM users WHERE lower(official_email) = 'dean.dofa@mygyanvihar.com' LIMIT 1;

  -- Operations → Chairman
  IF v_chairman IS NOT NULL AND v_coo IS NOT NULL THEN
    UPDATE users SET reporting_officer_id = v_chairman WHERE user_id = v_coo;
  END IF;

  -- Procurement chain: buyers → prochead → COO
  IF v_coo IS NOT NULL AND v_prochead IS NOT NULL THEN
    UPDATE users SET reporting_officer_id = v_coo WHERE user_id = v_prochead;
  END IF;
  IF v_prochead IS NOT NULL THEN
    UPDATE users SET reporting_officer_id = v_prochead
    WHERE lower(official_email) IN ('buyer.it@mygyanvihar.com', 'buyer.facilities@mygyanvihar.com', 'procurement@mygyanvihar.com');
  END IF;

  -- Stores chain: receiving → stores → COO (same COO ancestor OK; different immediate manager from buyers)
  IF v_coo IS NOT NULL AND v_stores IS NOT NULL THEN
    UPDATE users SET reporting_officer_id = v_coo WHERE user_id = v_stores;
  END IF;
  IF v_stores IS NOT NULL THEN
    UPDATE users SET reporting_officer_id = v_stores
    WHERE lower(official_email) IN ('receiving@mygyanvihar.com', 'security@mygyanvihar.com');
  END IF;

  -- Facilities / helpdesk → COO
  IF v_coo IS NOT NULL THEN
    UPDATE users SET reporting_officer_id = v_coo
    WHERE lower(official_email) IN ('estate@mygyanvihar.com', 'helpdesk.dispatch@mygyanvihar.com');
  END IF;

  -- Finance pillar → Chairman (never COO)
  IF v_chairman IS NOT NULL AND v_cfo IS NOT NULL THEN
    UPDATE users SET reporting_officer_id = v_chairman WHERE user_id = v_cfo;
  END IF;
  IF v_cfo IS NOT NULL AND v_apmgr IS NOT NULL THEN
    UPDATE users SET reporting_officer_id = v_cfo WHERE user_id = v_apmgr;
    UPDATE users SET reporting_officer_id = v_cfo
    WHERE lower(official_email) IN ('fincontroller@mygyanvihar.com', 'finance@mygyanvihar.com');
  END IF;
  IF v_apmgr IS NOT NULL THEN
    UPDATE users SET reporting_officer_id = v_apmgr
    WHERE lower(official_email) = 'apclerk@mygyanvihar.com';
  END IF;

  -- Auditor → Chairman
  IF v_chairman IS NOT NULL THEN
    UPDATE users SET reporting_officer_id = v_chairman
    WHERE lower(official_email) = 'auditor@mygyanvihar.com';
  END IF;

  -- Academic: labadmin → dean → president (if dean exists)
  IF v_dean IS NOT NULL THEN
    UPDATE users SET reporting_officer_id = v_dean
    WHERE lower(official_email) = 'labadmin@mygyanvihar.com'
      AND (reporting_officer_id IS NULL OR reporting_officer_id IS DISTINCT FROM v_dean);
  END IF;
  IF v_president IS NOT NULL AND v_dean IS NOT NULL THEN
    UPDATE users SET reporting_officer_id = v_president WHERE user_id = v_dean;
  END IF;
  IF v_chairman IS NOT NULL AND v_president IS NOT NULL THEN
    UPDATE users SET reporting_officer_id = v_chairman WHERE user_id = v_president AND reporting_officer_id IS NULL;
  END IF;
END $$;

-- Align DOFA L3: Finance co-signer is FinanceController (CFO signs as alias in app)
UPDATE fin_dofa_levels
SET required_roles = ARRAY['ProcurementHead', 'FinanceController']
WHERE level_no = 3;

-- Attach existing employee profiles to pillar org units (best-effort)
DO $$
DECLARE
  tid UUID;
  u_acad UUID;
  u_ops UUID;
  u_fin UUID;
BEGIN
  SELECT tenant_id INTO tid FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF tid IS NULL THEN RETURN; END IF;
  SELECT unit_id INTO u_acad FROM hr_org_units WHERE tenant_id = tid AND unit_type = 'PILLAR' AND unit_name = 'ACADEMIC' LIMIT 1;
  SELECT unit_id INTO u_ops FROM hr_org_units WHERE tenant_id = tid AND unit_type = 'PILLAR' AND unit_name = 'OPERATIONS' LIMIT 1;
  SELECT unit_id INTO u_fin FROM hr_org_units WHERE tenant_id = tid AND unit_type = 'PILLAR' AND unit_name = 'FINANCE' LIMIT 1;

  IF u_ops IS NOT NULL THEN
    UPDATE hr_employee_profiles ep SET org_unit_id = u_ops
    FROM users u JOIN roles r ON r.role_id = u.role_id
    WHERE ep.user_id = u.user_id AND ep.tenant_id = tid
      AND r.role_name IN ('COO','ProcurementHead','Procurement','ProcurementBuyer','Stores','Security','ReceivingClerk','EstateOfficer','HelpdeskDispatcher');
  END IF;
  IF u_fin IS NOT NULL THEN
    UPDATE hr_employee_profiles ep SET org_unit_id = u_fin
    FROM users u JOIN roles r ON r.role_id = u.role_id
    WHERE ep.user_id = u.user_id AND ep.tenant_id = tid
      AND r.role_name IN ('CFO','APManager','APClerk','Accountant','FinanceController','InternalAuditor');
  END IF;
  IF u_acad IS NOT NULL THEN
    UPDATE hr_employee_profiles ep SET org_unit_id = u_acad
    FROM users u JOIN roles r ON r.role_id = u.role_id
    WHERE ep.user_id = u.user_id AND ep.tenant_id = tid
      AND r.role_name IN ('President','Dean','HOD','LabAdmin','Faculty','Warden');
  END IF;
END $$;

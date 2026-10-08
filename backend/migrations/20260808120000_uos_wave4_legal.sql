-- UOS Wave 4: Legal MOU DOFA + accreditation evidence hooks

INSERT INTO roles (role_name, description)
VALUES ('LegalOfficer', 'Legal Officer — MOU DOFA first signer')
ON CONFLICT (role_name) DO UPDATE SET description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS legal_mou_approvals (
  mou_approval_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  document_id UUID,
  title TEXT NOT NULL,
  counterparty TEXT,
  pdf_path TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING_LEGAL',
  submitted_by UUID REFERENCES users(user_id),
  legal_by UUID REFERENCES users(user_id),
  legal_at TIMESTAMPTZ,
  dean_by UUID REFERENCES users(user_id),
  dean_at TIMESTAMPTZ,
  vc_by UUID REFERENCES users(user_id),
  vc_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accreditation_evidence_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  source_system VARCHAR(40) NOT NULL,
  source_id VARCHAR(80),
  criteria_hint VARCHAR(80),
  title TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

WITH tenant AS (SELECT tenant_id FROM tenants WHERE subdomain = 'sgvu' LIMIT 1),
pwd AS (SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id,
  password_hash, salary_base, onboarding_status, is_active
)
SELECT 'c4000002-cccc-4000-8000-000000000002'::uuid, t.tenant_id,
  'Legal Officer', 'legal@mygyanvihar.com', r.role_id, pwd.hash, 95000, 'ACTIVE', true
FROM tenant t CROSS JOIN pwd
JOIN roles r ON r.role_name = 'LegalOfficer'
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  role_id = EXCLUDED.role_id, password_hash = EXCLUDED.password_hash, is_active = true;

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u JOIN tenants t ON t.tenant_id = u.tenant_id AND t.subdomain = 'sgvu'
WHERE lower(u.official_email) = 'legal@mygyanvihar.com'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

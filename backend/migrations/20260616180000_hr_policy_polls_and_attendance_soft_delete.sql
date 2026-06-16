-- Policy voting table (referenced by ESS policy APIs but was never migrated)
-- Soft-delete columns for attendance/holiday entities (TypeORM BaseSoftDeleteEntity)

CREATE TABLE IF NOT EXISTS hr_policy_polls (
  policy_id UUID NOT NULL REFERENCES hr_policy_documents(policy_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  vote VARCHAR(10) NOT NULL CHECK (vote IN ('YES', 'NO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (policy_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_policy_polls_policy ON hr_policy_polls(policy_id);
CREATE INDEX IF NOT EXISTS idx_hr_policy_polls_user ON hr_policy_polls(user_id);

ALTER TABLE hr_holidays ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE hr_daily_attendance ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE hr_holidays ADD COLUMN IF NOT EXISTS entity_id INT NULL REFERENCES org_entities(entity_id);
ALTER TABLE hr_holidays ADD COLUMN IF NOT EXISTS applicable_to VARCHAR(50) NOT NULL DEFAULT 'ALL';

-- Ensure smoke policy documents exist for SGVU (ESS faculty policies page)
WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
ent AS (
  SELECT entity_id FROM org_entities o
  JOIN tenant t ON t.tenant_id = o.tenant_id
  WHERE o.entity_code = 'SGVU_UNIVERSITY' LIMIT 1
)
INSERT INTO hr_policy_documents (tenant_id, entity_id, title, category, file_url, is_mandatory, is_active)
SELECT t.tenant_id, e.entity_id, data.title, data.cat, data.url, TRUE, TRUE
FROM tenant t, ent e
CROSS JOIN (VALUES
  ('Leave Policy 2026', 'LEAVE', '/policies/leave-policy-2026.pdf'),
  ('POSH Act Guidelines', 'COMPLIANCE', '/policies/posh-act.pdf'),
  ('Travel Allowance Policy', 'TRAVEL', '/policies/travel-allowance.pdf')
) AS data(title, cat, url)
WHERE NOT EXISTS (
  SELECT 1 FROM hr_policy_documents p
  WHERE p.title = data.title AND p.entity_id = e.entity_id AND p.tenant_id = t.tenant_id
);

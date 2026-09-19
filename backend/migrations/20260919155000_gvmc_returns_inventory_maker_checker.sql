-- Keep the consolidated GVMC personas usable without weakening maker-checker:
-- the procurement reviewer evaluates eligibility, the college approver decides
-- disposition, and the inventory verifier acknowledges Stores state changes.

WITH persona AS (
  SELECT tenant.tenant_id, qa_user.user_id, grants.capability
  FROM tenants tenant
  JOIN LATERAL (
    VALUES
      ('college-approver.gvmc@mygyanvihar.com', 'RETURNS_VIEW'),
      ('college-approver.gvmc@mygyanvihar.com', 'RETURNS_APPROVE'),
      ('inventory-verifier.gvmc@mygyanvihar.com', 'INVENTORY_TRANSFER')
  ) grants(email, capability) ON true
  JOIN users qa_user
    ON qa_user.tenant_id = tenant.tenant_id
   AND lower(qa_user.official_email) = grants.email
   AND qa_user.is_active = true
   AND qa_user.deleted_at IS NULL
  WHERE lower(tenant.subdomain) = 'gvmc'
)
INSERT INTO acq_access_grants (
  tenant_id,
  principal_user_id,
  capability,
  scope_type,
  scope_reference,
  valid_from
)
SELECT
  persona.tenant_id,
  persona.user_id,
  persona.capability,
  'TENANT',
  NULL,
  NOW()
FROM persona
WHERE NOT EXISTS (
  SELECT 1
  FROM acq_access_grants existing
  WHERE existing.tenant_id = persona.tenant_id
    AND existing.principal_user_id = persona.user_id
    AND existing.capability = persona.capability
    AND existing.scope_type = 'TENANT'
    AND existing.scope_reference IS NULL
    AND (existing.valid_until IS NULL OR existing.valid_until > NOW())
);

UPDATE acq_access_grants grant_row
SET valid_until = NOW()
FROM tenants tenant, users qa_user
WHERE tenant.tenant_id = grant_row.tenant_id
  AND lower(tenant.subdomain) = 'gvmc'
  AND qa_user.user_id = grant_row.principal_user_id
  AND qa_user.tenant_id = tenant.tenant_id
  AND lower(qa_user.official_email) = 'procurement-review.gvmc@mygyanvihar.com'
  AND grant_row.capability = 'RETURNS_APPROVE'
  AND (grant_row.valid_until IS NULL OR grant_row.valid_until > NOW());

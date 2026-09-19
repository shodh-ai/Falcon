-- Complete the consolidated GVMC Module 8 persona chain without collapsing
-- maker-checker duties onto one account:
-- requester (G01) -> reviewer/assigner (G05) -> technician (G08)
-- -> independent acceptor (G02). Warranty exceptions use G03.

WITH persona AS (
  SELECT tenant.tenant_id, qa_user.user_id, grants.capability
  FROM tenants tenant
  JOIN LATERAL (
    VALUES
      ('college-approver.gvmc@mygyanvihar.com', 'ASSET_SERVICE_VIEW'),
      ('college-approver.gvmc@mygyanvihar.com', 'ASSET_SERVICE_WARRANTY_EXCEPTION'),
      ('procurement-review.gvmc@mygyanvihar.com', 'ASSET_SERVICE_VIEW'),
      ('procurement-review.gvmc@mygyanvihar.com', 'ASSET_SERVICE_TRIAGE'),
      ('procurement-review.gvmc@mygyanvihar.com', 'ASSET_SERVICE_ASSIGN'),
      ('procurement-review.gvmc@mygyanvihar.com', 'ASSET_SERVICE_WARRANTY_REVIEW'),
      ('procurement-review.gvmc@mygyanvihar.com', 'ASSET_SERVICE_ESTIMATE_APPROVE'),
      ('receiving-stores.gvmc@mygyanvihar.com', 'ASSET_SERVICE_VIEW'),
      ('receiving-stores.gvmc@mygyanvihar.com', 'ASSET_SERVICE_EXECUTE'),
      ('receiving-stores.gvmc@mygyanvihar.com', 'ASSET_SERVICE_PARTS_MANAGE')
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

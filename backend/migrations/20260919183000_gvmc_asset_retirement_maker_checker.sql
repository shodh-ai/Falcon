-- Complete the consolidated GVMC Module 9 execution chain without combining
-- sanitization or handover maker-checker duties:
-- requester (G01) -> assessor/DoFA submitter (G05) -> finance (G07)
-- -> sanitization/disposal operator (G08) -> independent verifier (G09).

WITH persona AS (
  SELECT tenant.tenant_id, qa_user.user_id, grants.capability
  FROM tenants tenant
  JOIN LATERAL (
    VALUES
      ('receiving-stores.gvmc@mygyanvihar.com', 'ASSET_RETIREMENT_VIEW'),
      ('receiving-stores.gvmc@mygyanvihar.com', 'ASSET_SANITIZATION_EXECUTE'),
      ('receiving-stores.gvmc@mygyanvihar.com', 'ASSET_DISPOSAL_PREPARE'),
      ('receiving-stores.gvmc@mygyanvihar.com', 'ASSET_DISPOSAL_EXECUTE'),
      ('inventory-verifier.gvmc@mygyanvihar.com', 'ASSET_RETIREMENT_VIEW'),
      ('inventory-verifier.gvmc@mygyanvihar.com', 'ASSET_SANITIZATION_VERIFY'),
      ('inventory-verifier.gvmc@mygyanvihar.com', 'ASSET_DISPOSAL_ACCEPT')
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

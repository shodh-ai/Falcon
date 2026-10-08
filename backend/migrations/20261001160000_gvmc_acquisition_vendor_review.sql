-- Give the dedicated GVMC procurement reviewer the Module 1 vendor-review
-- capability.  The grant is tenant- and user-scoped, idempotent, and does not
-- broaden the procurement operator's permissions.
WITH gvmc_reviewer AS (
  SELECT tenant.tenant_id, qa_user.user_id
  FROM tenants AS tenant
  JOIN users AS qa_user
    ON qa_user.tenant_id = tenant.tenant_id
   AND lower(qa_user.official_email) = 'procurement-review.gvmc@mygyanvihar.com'
  WHERE lower(tenant.subdomain) = 'gvmc'
    AND qa_user.is_active = true
    AND qa_user.deleted_at IS NULL
  LIMIT 1
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
  reviewer.tenant_id,
  reviewer.user_id,
  'ACQUISITION_VENDOR_REVIEW',
  'TENANT',
  NULL,
  NOW()
FROM gvmc_reviewer AS reviewer
WHERE NOT EXISTS (
  SELECT 1
  FROM acq_access_grants AS existing
  WHERE existing.tenant_id = reviewer.tenant_id
    AND existing.principal_user_id = reviewer.user_id
    AND existing.capability = 'ACQUISITION_VENDOR_REVIEW'
    AND existing.scope_type = 'TENANT'
    AND existing.scope_reference IS NULL
    AND (existing.valid_until IS NULL OR existing.valid_until > NOW())
);

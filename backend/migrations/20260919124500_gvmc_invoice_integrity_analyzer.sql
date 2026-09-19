-- Preserve Module 3 maker-checker in the GVMC production-QA cohort:
-- Procurement Reviewer performs deterministic analysis while the separate
-- Budget Integrity Reviewer retains final certification authority.
WITH gvmc_reviewer AS (
  SELECT tenant.tenant_id, qa_user.user_id
  FROM tenants tenant
  JOIN users qa_user
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
  'INVOICE_INTEGRITY_ANALYZE',
  'TENANT',
  NULL,
  NOW()
FROM gvmc_reviewer reviewer
WHERE NOT EXISTS (
  SELECT 1
  FROM acq_access_grants existing
  WHERE existing.tenant_id = reviewer.tenant_id
    AND existing.principal_user_id = reviewer.user_id
    AND existing.capability = 'INVOICE_INTEGRITY_ANALYZE'
    AND existing.scope_type = 'TENANT'
    AND existing.scope_reference IS NULL
    AND (existing.valid_until IS NULL OR existing.valid_until > NOW())
);

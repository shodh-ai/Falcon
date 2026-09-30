-- Grade-change requests are used by every tenant.  The original DoFA seed
-- only created a tenant-specific row for the `sgvu` subdomain, which leaves
-- other production tenants with no matrix and turns a valid submission into
-- a generic 500.  Add the immutable global fallback used by the resolver.
INSERT INTO dofa_matrices (
  tenant_id, domain, rule_key, amount_min, amount_max,
  required_roles, required_signatures, exception_escalate_role, is_active
)
SELECT
  NULL, 'GRADE_CHANGE', 'DEFAULT', NULL, NULL,
  ARRAY['HOD','ExamCell']::text[], 2, 'Chairman', true
WHERE NOT EXISTS (
  SELECT 1
  FROM dofa_matrices
  WHERE tenant_id IS NULL
    AND domain = 'GRADE_CHANGE'
    AND rule_key = 'DEFAULT'
);

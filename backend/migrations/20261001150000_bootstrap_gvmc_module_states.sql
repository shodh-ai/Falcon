-- GVMC was provisioned after the platform-module compatibility bootstrap.
-- Launch the finance/procurement suite required by the GVMC HOD workflow.
-- This does not bypass RBAC/capability checks and does not overwrite an
-- explicitly configured state for any module.
INSERT INTO platform_module_states (
  module_key,
  tenant_id,
  scope_type,
  state,
  reason
)
SELECT
  'finance_procurement',
  t.tenant_id,
  'TENANT',
  'ACTIVE',
  'GVMC compatibility bootstrap for existing tenant'
FROM tenants AS t
WHERE lower(t.subdomain) = 'gvmc'
ON CONFLICT (module_key, tenant_id, scope_type, scope_id) DO NOTHING;

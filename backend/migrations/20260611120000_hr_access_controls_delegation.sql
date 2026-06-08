-- Layer 1 & 3: Granular HR access controls with department/entity scope.

CREATE TABLE IF NOT EXISTS hr_access_controls (
  access_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  module_name VARCHAR(50) NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit BOOLEAN NOT NULL DEFAULT FALSE,
  can_approve BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete BOOLEAN NOT NULL DEFAULT FALSE,
  department_scope INT[] NULL,
  entity_scope INT[] NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id, module_name)
);

CREATE INDEX IF NOT EXISTS idx_hr_access_controls_user
  ON hr_access_controls(tenant_id, user_id);

-- Migrate legacy hr_permissions JSONB into granular rows (view/edit only; approve off by default).
INSERT INTO hr_access_controls (tenant_id, user_id, module_name, can_view, can_edit, can_approve, can_delete)
SELECT p.tenant_id,
       p.user_id,
       UPPER(REPLACE(kv.key, '-', '_')) AS module_name,
       (kv.value IN ('read', 'write')) AS can_view,
       (kv.value = 'write') AS can_edit,
       FALSE,
       FALSE
FROM hr_permissions p
CROSS JOIN LATERAL jsonb_each_text(p.capabilities) AS kv(key, value)
WHERE kv.value IS NOT NULL AND kv.value <> 'none'
ON CONFLICT (tenant_id, user_id, module_name) DO UPDATE SET
  can_view = EXCLUDED.can_view OR hr_access_controls.can_view,
  can_edit = EXCLUDED.can_edit OR hr_access_controls.can_edit,
  updated_at = NOW();

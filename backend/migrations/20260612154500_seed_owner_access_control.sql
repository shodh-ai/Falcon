-- Seed initial Owner access for sgvu chairman persona
WITH t AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
)
INSERT INTO owner_access_control (tenant_id, user_id, role_label, is_active)
SELECT t.tenant_id, 'c0000001-0000-4000-8000-000000000001'::uuid, 'Chairman', true
FROM t
ON CONFLICT (tenant_id, user_id) DO UPDATE SET is_active = true;

-- Backfill any remaining NULL entity_id on employee profiles, then enforce NOT NULL.

WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
default_entity AS (
  SELECT entity_id FROM org_entities o
  JOIN tenant t ON t.tenant_id = o.tenant_id
  WHERE o.entity_code = 'SGVU_UNIVERSITY' LIMIT 1
)
UPDATE hr_employee_profiles ep
SET entity_id = (SELECT entity_id FROM default_entity)
WHERE ep.entity_id IS NULL
  AND ep.tenant_id = (SELECT tenant_id FROM tenant);

ALTER TABLE hr_employee_profiles
  ALTER COLUMN entity_id SET NOT NULL;

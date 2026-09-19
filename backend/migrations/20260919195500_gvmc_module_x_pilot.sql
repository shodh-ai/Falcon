-- Enable the controlled GVMC Module X simulator/retrofit and gate-observation
-- pilot. The inventory activation gate remains disabled until hardware-pilot
-- acceptance, so existing Module 5 workflows are not blocked.
WITH gvmc AS (
  SELECT tenant_id
  FROM tenants
  WHERE lower(subdomain) = 'gvmc'
), requested_flags(feature_key, is_enabled) AS (
  VALUES
    ('dofa_module_x_physical_identity', TRUE),
    ('dofa_module_x_gate_observation', TRUE),
    ('dofa_module_x_retrofit', TRUE),
    ('dofa_module_x_provisioning_gate', FALSE)
)
INSERT INTO tenant_subscriptions (tenant_id, feature_key, is_enabled)
SELECT gvmc.tenant_id, requested_flags.feature_key, requested_flags.is_enabled
FROM gvmc
CROSS JOIN requested_flags
ON CONFLICT (tenant_id, feature_key)
DO UPDATE SET is_enabled = EXCLUDED.is_enabled;

WITH persona AS (
  SELECT tenant.tenant_id, qa_user.user_id, grants.capability
  FROM tenants tenant
  JOIN LATERAL (
    VALUES
      ('receiving-stores.gvmc@mygyanvihar.com', 'PHYSICAL_IDENTITY_RETROFIT'),
      ('tenant-admin.gvmc@mygyanvihar.com', 'PHYSICAL_IDENTITY_VIEW')
  ) grants(email, capability) ON TRUE
  JOIN users qa_user
    ON qa_user.tenant_id = tenant.tenant_id
   AND lower(qa_user.official_email) = grants.email
   AND qa_user.is_active = TRUE
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

WITH gvmc AS (
  SELECT tenant_id
  FROM tenants
  WHERE lower(subdomain) = 'gvmc'
)
INSERT INTO pix_label_templates (
  tenant_id,
  template_version,
  name,
  status,
  rendered_template_hash,
  published_at
)
SELECT
  gvmc.tenant_id,
  1,
  'Standard Asset Label',
  'PUBLISHED',
  encode(digest('STANDARD_ASSET_LABEL_V1', 'sha256'), 'hex'),
  NOW()
FROM gvmc
WHERE NOT EXISTS (
  SELECT 1
  FROM pix_label_templates existing
  WHERE existing.tenant_id = gvmc.tenant_id
    AND existing.status = 'PUBLISHED'
);

WITH gvmc AS (
  SELECT tenant_id
  FROM tenants
  WHERE lower(subdomain) = 'gvmc'
), simulator AS (
  SELECT hardware_profile_id
  FROM pix_hardware_profiles
  WHERE tenant_id IS NULL
    AND profile_code = 'DETERMINISTIC-SIMULATOR'
    AND status = 'ACTIVE'
  LIMIT 1
)
INSERT INTO pix_policies (
  tenant_id,
  policy_version,
  status,
  category,
  currency,
  rfid_value_threshold,
  allowed_hardware_profiles,
  attachment_methods,
  retrofit_allowed,
  published_at
)
SELECT
  gvmc.tenant_id,
  1,
  'PUBLISHED',
  '*',
  'INR',
  500,
  jsonb_build_array(simulator.hardware_profile_id),
  '["DESTRUCTIVE_ADHESIVE","LAMINATED","EMBEDDED","ASSET_SPECIFIC"]'::jsonb,
  TRUE,
  NOW()
FROM gvmc
CROSS JOIN simulator
WHERE NOT EXISTS (
  SELECT 1
  FROM pix_policies existing
  WHERE existing.tenant_id = gvmc.tenant_id
    AND existing.status = 'PUBLISHED'
);

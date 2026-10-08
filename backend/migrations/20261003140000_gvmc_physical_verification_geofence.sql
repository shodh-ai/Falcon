-- Publish the GVMC wildcard geofence used by the Module 4 live-capture flow.
-- The public SGVU campus map pin is 26.8100126, 75.862434.  A wildcard
-- campus reference is intentional: the capture client currently omits an
-- explicit campus_reference and the service falls back to '*'.
DO $$
DECLARE
  v_tenant_id UUID;
  v_published_by UUID;
  v_policy_version INT;
BEGIN
  SELECT tenant_id
    INTO v_tenant_id
  FROM tenants
  WHERE lower(subdomain) = 'gvmc'
    AND is_active = true
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'GVMC tenant is not present; skipping physical-verification geofence seed';
    RETURN;
  END IF;

  SELECT user_id
    INTO v_published_by
  FROM users
  WHERE tenant_id = v_tenant_id
    AND lower(official_email) = 'tenant-admin.gvmc@mygyanvihar.com'
    AND is_active = true
    AND deleted_at IS NULL
  LIMIT 1;

  IF NOT EXISTS (
    SELECT 1
    FROM pv_geofence_policies
    WHERE tenant_id = v_tenant_id
      AND campus_reference = '*'
      AND status = 'PUBLISHED'
      AND effective_from <= NOW()
      AND (effective_to IS NULL OR effective_to > NOW())
  ) THEN
    SELECT COALESCE(MAX(policy_version), 0) + 1
      INTO v_policy_version
    FROM pv_geofence_policies
    WHERE tenant_id = v_tenant_id
      AND campus_reference = '*';

    INSERT INTO pv_geofence_policies (
      tenant_id,
      campus_reference,
      policy_version,
      status,
      geometry_type,
      geometry,
      maximum_accuracy_metres,
      published_by,
      published_at
    )
    VALUES (
      v_tenant_id,
      '*',
      v_policy_version,
      'PUBLISHED',
      'CIRCLE',
      jsonb_build_object(
        'latitude', 26.8100126,
        'longitude', 75.862434,
        'radius_metres', 500
      ),
      100,
      v_published_by,
      NOW()
    );
  END IF;
END $$;

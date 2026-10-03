-- The dedicated GVMC production-QA procurement operator must be able to
-- consume the tenant-scoped Vendor Master lookup used by Module 2 order entry.
-- Keep this grant user-scoped so it does not widen every similarly named role.
DO $$
DECLARE
  v_tenant_id UUID;
  v_user_id UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM tenants
  WHERE lower(subdomain) = 'gvmc'
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  SELECT user_id INTO v_user_id
  FROM users
  WHERE tenant_id = v_tenant_id
    AND lower(official_email) = 'procurement-operator.gvmc@mygyanvihar.com'
    AND is_active = true
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO acq_access_grants (
    tenant_id, principal_user_id, capability, scope_type, scope_reference,
    valid_from
  )
  SELECT v_tenant_id, v_user_id, capability, 'TENANT', NULL, NOW()
  FROM (VALUES ('PROCUREMENT_VIEW'), ('PROCUREMENT_ORDER_ENTRY')) AS grants(capability)
  WHERE NOT EXISTS (
    SELECT 1
    FROM acq_access_grants existing
    WHERE existing.tenant_id = v_tenant_id
      AND existing.principal_user_id = v_user_id
      AND existing.capability = grants.capability
      AND existing.scope_type = 'TENANT'
      AND existing.scope_reference IS NULL
      AND (existing.valid_until IS NULL OR existing.valid_until > NOW())
  );
END $$;

-- Repair the GVMC requester pilot data without changing permanent identities.
-- Existing installations retain the original funding-source UUID where possible.
DO $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM tenants
  WHERE lower(subdomain) = 'gvmc'
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM acq_funding_sources
    WHERE tenant_id = v_tenant_id
      AND funding_source_type = 'PROJECT'
      AND name = 'GVMC test funding source'
  ) THEN
    UPDATE acq_funding_sources
    SET is_active = true
    WHERE tenant_id = v_tenant_id
      AND funding_source_type = 'PROJECT'
      AND name = 'GVMC test funding source';
  ELSIF EXISTS (
    SELECT 1 FROM acq_funding_sources
    WHERE tenant_id = v_tenant_id
      AND funding_source_type = 'PROJECT'
      AND name = 'GVMC Construction'
  ) THEN
    UPDATE acq_funding_sources
    SET name = 'GVMC test funding source', is_active = true
    WHERE tenant_id = v_tenant_id
      AND funding_source_type = 'PROJECT'
      AND name = 'GVMC Construction';
  ELSE
    INSERT INTO acq_funding_sources (
      tenant_id, funding_source_type, name, allocated_amount, is_active
    ) VALUES (
      v_tenant_id, 'PROJECT', 'GVMC test funding source', 10000000, true
    );
  END IF;

  INSERT INTO acq_access_grants (
    tenant_id, principal_user_id, capability, scope_type, scope_reference
  )
  SELECT v_tenant_id, u.user_id, 'ACQUISITION_REQUESTER',
         CASE WHEN u.dept_id IS NULL THEN 'TENANT' ELSE 'DEPARTMENT' END,
         CASE WHEN u.dept_id IS NULL THEN NULL ELSE u.dept_id::text END
  FROM users u
  WHERE u.tenant_id = v_tenant_id
    AND lower(u.official_email) = 'requester.gvmc@mygyanvihar.com'
    AND u.is_active = true
    AND NOT EXISTS (
      SELECT 1
      FROM acq_access_grants g
      WHERE g.tenant_id = v_tenant_id
        AND g.principal_user_id = u.user_id
        AND g.capability = 'ACQUISITION_REQUESTER'
        AND g.valid_from <= NOW()
        AND (g.valid_until IS NULL OR g.valid_until > NOW())
    );
END $$;

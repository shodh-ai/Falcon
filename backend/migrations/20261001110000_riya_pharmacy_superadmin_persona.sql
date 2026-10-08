-- Grant the existing Riya Pharmacy test account the same SuperAdmin persona
-- and audited, read-only persona switcher available to Kriti.
-- The account keeps its existing identity; only role/access projections change.

DO $$
DECLARE
  v_tenant UUID;
  v_user UUID;
  v_super_role INT;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM tenants
  WHERE subdomain = 'sgvu' AND is_active = true
  LIMIT 1;

  SELECT user_id INTO v_user
  FROM users
  WHERE tenant_id = v_tenant
    AND lower(official_email) = 'riya.pharmacy@mygyanvihar.com'
    AND deleted_at IS NULL
  LIMIT 1;

  SELECT role_id INTO v_super_role
  FROM roles
  WHERE role_name = 'SuperAdmin'
  LIMIT 1;

  IF v_tenant IS NULL OR v_user IS NULL OR v_super_role IS NULL THEN
    RAISE NOTICE 'Riya SuperAdmin promotion skipped: required account or role missing';
    RETURN;
  END IF;

  UPDATE users
  SET role_id = v_super_role,
      name = 'Riya Super Admin',
      is_active = true,
      onboarding_status = 'COMPLETED',
      account_status = 'ACTIVE',
      updated_at = NOW()
  WHERE user_id = v_user;

  -- Keep the role projection unambiguous: SuperAdmin is the only primary role.
  UPDATE user_roles
  SET is_primary = false
  WHERE user_id = v_user;

  INSERT INTO user_roles (user_id, role_id, is_primary)
  VALUES (v_user, v_super_role, true)
  ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = true;

  -- Match Kriti's tenant-wide entity visibility.
  INSERT INTO user_entity_access (user_id, entity_id)
  SELECT v_user, entity_id
  FROM org_entities
  WHERE tenant_id = v_tenant AND is_active = true
  ON CONFLICT (user_id, entity_id) DO NOTHING;

  INSERT INTO system_audit_logs (
    table_name, record_id, action, old_value, new_value, changed_by_user_id
  ) VALUES (
    'users', v_user, 'UPDATE',
    jsonb_build_object('official_email', 'riya.pharmacy@mygyanavihar.com', 'previous_role', 'Faculty'),
    jsonb_build_object(
      'official_email', 'riya.pharmacy@mygyanavihar.com',
      'role', 'SuperAdmin',
      'persona_switcher', 'audited_read_only',
      'source', '20261001110000_riya_pharmacy_superadmin_persona.sql'
    ),
    v_user
  );
END $$;

-- Dedicated production credentials for IQAC and Kriti's Super Admin account.
-- Passwords are temporary and are communicated out-of-band to the authorized owner.

DO $$
DECLARE
  v_tenant UUID;
  v_iqac_role INT;
  v_super_role INT;
  v_iqac_user UUID;
  v_kriti_user UUID;
  v_default_dept INT;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM tenants
  WHERE subdomain = 'sgvu'
  LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE NOTICE 'IQAC/Kriti credential seed skipped — sgvu tenant missing';
    RETURN;
  END IF;

  SELECT role_id INTO v_iqac_role FROM roles WHERE role_name = 'IQAC' LIMIT 1;
  SELECT role_id INTO v_super_role FROM roles WHERE role_name = 'SuperAdmin' LIMIT 1;
  SELECT dept_id INTO v_default_dept FROM departments ORDER BY dept_id ASC LIMIT 1;

  IF v_iqac_role IS NULL OR v_super_role IS NULL THEN
    RAISE EXCEPTION 'Required IQAC or SuperAdmin role is missing';
  END IF;

  SELECT user_id INTO v_iqac_user
  FROM users
  WHERE tenant_id = v_tenant
    AND lower(official_email) = 'iqac@mygyanvihar.com'
  LIMIT 1;

  IF v_iqac_user IS NULL THEN
    INSERT INTO users (
      tenant_id, name, official_email, role_id, dept_id, password_hash,
      is_active, onboarding_status, deleted_at
    ) VALUES (
      v_tenant, 'IQAC Office', 'iqac@mygyanvihar.com', v_iqac_role,
      v_default_dept, '$2b$10$66/uDX30cH7wemxuvSkcue3jYNpyRW.5R07ZPzbhx2pW.K8t2zWq6',
      true, 'COMPLETED', NULL
    ) RETURNING user_id INTO v_iqac_user;
  ELSE
    UPDATE users
    SET name = 'IQAC Office',
        role_id = v_iqac_role,
        password_hash = '$2b$10$66/uDX30cH7wemxuvSkcue3jYNpyRW.5R07ZPzbhx2pW.K8t2zWq6',
        is_active = true,
        onboarding_status = 'COMPLETED',
        deleted_at = NULL,
        updated_at = NOW()
    WHERE user_id = v_iqac_user;
  END IF;

  INSERT INTO user_roles (user_id, role_id, is_primary)
  VALUES (v_iqac_user, v_iqac_role, true)
  ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = true;

  UPDATE user_roles
  SET is_primary = false
  WHERE user_id = v_iqac_user AND role_id <> v_iqac_role;

  SELECT user_id INTO v_kriti_user
  FROM users
  WHERE tenant_id = v_tenant
    AND lower(official_email) = 'kriti.superadmin@mygyanvihar.com'
  LIMIT 1;

  IF v_kriti_user IS NULL THEN
    INSERT INTO users (
      tenant_id, name, official_email, role_id, dept_id, password_hash,
      is_active, onboarding_status, deleted_at
    ) VALUES (
      v_tenant, 'Kriti Super Admin', 'kriti.superadmin@mygyanvihar.com',
      v_super_role, v_default_dept,
      '$2b$10$kM/N1572fVg104VMx9taL.HDEPeySCsk9WEAFYiS6mr3j.PItdnJW',
      true, 'COMPLETED', NULL
    ) RETURNING user_id INTO v_kriti_user;
  ELSE
    UPDATE users
    SET name = 'Kriti Super Admin',
        role_id = v_super_role,
        password_hash = '$2b$10$kM/N1572fVg104VMx9taL.HDEPeySCsk9WEAFYiS6mr3j.PItdnJW',
        is_active = true,
        onboarding_status = 'COMPLETED',
        deleted_at = NULL,
        updated_at = NOW()
    WHERE user_id = v_kriti_user;
  END IF;

  INSERT INTO user_roles (user_id, role_id, is_primary)
  VALUES (v_kriti_user, v_super_role, true)
  ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = true;

  UPDATE user_roles
  SET is_primary = false
  WHERE user_id = v_kriti_user AND role_id <> v_super_role;

  INSERT INTO user_entity_access (user_id, entity_id)
  SELECT v_kriti_user, oe.entity_id
  FROM org_entities oe
  WHERE oe.tenant_id = v_tenant AND oe.is_active = true
  ON CONFLICT (user_id, entity_id) DO NOTHING;
END $$;

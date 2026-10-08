-- Admin Control Center portal login personas (tenant: sgvu)
-- Password for all: password123
--
-- Primary Admin Portal login:
--   Email:    campusadmin@mygyanvihar.com
--   Password: password123
--   Role:     CampusAdmin  → /admin/dashboard
--
-- Also ensured:
--   superadmin@mygyanvihar.com / password123  (SuperAdmin)
--   registrar@mygyanvihar.com  / password123  (Registrar)

DO $$
DECLARE
  v_tenant UUID;
  v_hash VARCHAR := '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO';
  v_dept INT;
  v_user UUID;
  v_role INT;
  r RECORD;
BEGIN
  SELECT tenant_id INTO v_tenant FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'admin control login seed skipped — sgvu tenant missing';
    RETURN;
  END IF;

  SELECT dept_id INTO v_dept FROM departments WHERE dept_name = 'Computer Science' LIMIT 1;

  FOR r IN
    SELECT * FROM (VALUES
      ('campusadmin@mygyanvihar.com', 'Campus Admin', 'CampusAdmin'),
      ('superadmin@mygyanvihar.com',  'Super Admin',  'SuperAdmin'),
      ('registrar@mygyanvihar.com',   'University Registrar', 'Registrar')
    ) AS t(email, display_name, role_name)
  LOOP
    SELECT role_id INTO v_role FROM roles WHERE role_name = r.role_name LIMIT 1;
    IF v_role IS NULL THEN
      INSERT INTO roles (role_name, description)
      VALUES (r.role_name, r.role_name || ' portal access')
      RETURNING role_id INTO v_role;
    END IF;

    SELECT user_id INTO v_user
    FROM users
    WHERE tenant_id = v_tenant AND lower(official_email) = lower(r.email)
    LIMIT 1;

    IF v_user IS NULL THEN
      INSERT INTO users (
        tenant_id, name, official_email, role_id, dept_id,
        password_hash, is_active, onboarding_status, deleted_at
      )
      VALUES (
        v_tenant, r.display_name, r.email, v_role, v_dept,
        v_hash, true, 'COMPLETED', NULL
      )
      RETURNING user_id INTO v_user;
    ELSE
      UPDATE users
      SET
        name = r.display_name,
        role_id = v_role,
        dept_id = COALESCE(dept_id, v_dept),
        password_hash = v_hash,
        is_active = true,
        deleted_at = NULL,
        onboarding_status = 'COMPLETED',
        updated_at = NOW()
      WHERE user_id = v_user;
    END IF;

    INSERT INTO user_roles (user_id, role_id, is_primary)
    VALUES (v_user, v_role, true)
    ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = true;

    -- Keep a single primary role claim for JWT routing
    UPDATE user_roles ur
    SET is_primary = false
    WHERE ur.user_id = v_user
      AND ur.role_id <> v_role
      AND ur.is_primary = true;
  END LOOP;

  -- Entity access for CampusAdmin / SuperAdmin (all active entities in tenant)
  INSERT INTO user_entity_access (user_id, entity_id)
  SELECT u.user_id, oe.entity_id
  FROM users u
  JOIN org_entities oe ON oe.tenant_id = u.tenant_id AND oe.is_active = true
  WHERE u.tenant_id = v_tenant
    AND lower(u.official_email) IN (
      'campusadmin@mygyanvihar.com',
      'superadmin@mygyanvihar.com'
    )
  ON CONFLICT (user_id, entity_id) DO NOTHING;

  RAISE NOTICE 'Admin portal logins ready: campusadmin@ / superadmin@ / registrar@ — password123';
END $$;

-- Provision a temporary Pharmacy faculty portal account for Riya.
-- This account intentionally has no teaching allocation. The department may
-- later replace the provisional HR metadata after confirming the official EID.

BEGIN;

DO $$
DECLARE
  v_tenant UUID;
  v_dept INTEGER;
  v_role INTEGER;
  v_entity INTEGER;
  v_hod UUID;
  v_user UUID;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM public.tenants
  WHERE subdomain = 'sgvu' AND is_active = true
  LIMIT 1;

  SELECT dept_id INTO v_dept
  FROM departments
  WHERE lower(dept_name) = 'pharmacy'
  ORDER BY dept_id
  LIMIT 1;

  SELECT role_id INTO v_role
  FROM roles
  WHERE role_name = 'Faculty'
  LIMIT 1;

  IF v_tenant IS NULL OR v_dept IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION 'Active SGVU tenant, Pharmacy department and Faculty role are required';
  END IF;

  SELECT user_id INTO v_hod
  FROM users
  WHERE tenant_id = v_tenant
    AND lower(official_email) = 'hitesh.kumar@mygyanvihar.com'
    AND is_active = true
    AND deleted_at IS NULL
  LIMIT 1;

  SELECT COALESCE(
    (SELECT entity_id FROM org_entities
     WHERE tenant_id = v_tenant
       AND entity_code = 'SGVU_UNIVERSITY'
       AND is_active = true
     LIMIT 1),
    (SELECT entity_id FROM org_entities
     WHERE tenant_id = v_tenant AND is_active = true
     ORDER BY entity_id
     LIMIT 1)
  ) INTO v_entity;

  SELECT user_id INTO v_user
  FROM users
  WHERE tenant_id = v_tenant
    AND lower(official_email) = 'riya.pharmacy@mygyanvihar.com'
  LIMIT 1;

  IF v_user IS NULL THEN
    v_user := '3c0489c5-a423-4337-99dc-e36c8fae6244'::uuid;
    INSERT INTO users (
      user_id, tenant_id, name, official_email, role_id, dept_id,
      password_hash, is_active, onboarding_status, onboarding_profile,
      account_status, reporting_officer_id, entity_id, deleted_at, updated_at
    ) VALUES (
      v_user, v_tenant, 'Riya', 'riya.pharmacy@mygyanvihar.com',
      v_role, v_dept,
      '$2b$12$i8sxtclHklspn5GidEMBmO1Fjj6JDDUkfXrZA3FhwSRmh7edTIW7m',
      true, 'COMPLETED', '{}'::jsonb, 'ACTIVE', v_hod, v_entity, NULL, NOW()
    );
  ELSE
    UPDATE users
    SET name = 'Riya',
        role_id = v_role,
        dept_id = v_dept,
        password_hash = '$2b$12$i8sxtclHklspn5GidEMBmO1Fjj6JDDUkfXrZA3FhwSRmh7edTIW7m',
        is_active = true,
        onboarding_status = 'COMPLETED',
        onboarding_profile = '{}'::jsonb,
        account_status = 'ACTIVE',
        reporting_officer_id = v_hod,
        entity_id = COALESCE(v_entity, entity_id),
        deleted_at = NULL,
        updated_at = NOW()
    WHERE user_id = v_user;
  END IF;

  UPDATE user_roles
  SET is_primary = false
  WHERE user_id = v_user AND role_id <> v_role AND is_primary = true;

  INSERT INTO user_roles (user_id, role_id, is_primary)
  VALUES (v_user, v_role, true)
  ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = true;

  IF v_entity IS NOT NULL THEN
    INSERT INTO user_entity_access (user_id, entity_id)
    VALUES (v_user, v_entity)
    ON CONFLICT (user_id, entity_id) DO NOTHING;

    INSERT INTO hr_employee_profiles (
      tenant_id, user_id, employee_id, designation, joining_date,
      entity_id, shift_id, week_off_day, updated_at
    ) VALUES (
      v_tenant, v_user, 'PH-RIYA-TEMP', 'Faculty', CURRENT_DATE,
      v_entity,
      (SELECT shift_id FROM hr_shifts
       WHERE shift_name = 'Faculty 9-4' AND entity_id = v_entity
       LIMIT 1),
      0, NOW()
    )
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET
      designation = EXCLUDED.designation,
      entity_id = EXCLUDED.entity_id,
      shift_id = COALESCE(EXCLUDED.shift_id, hr_employee_profiles.shift_id),
      updated_at = NOW();
  END IF;

  INSERT INTO system_audit_logs (
    table_name, record_id, action, old_value, new_value, changed_by_user_id
  ) VALUES (
    'users', v_user, 'UPDATE', NULL,
    jsonb_build_object(
      'official_email', 'riya.pharmacy@mygyanvihar.com',
      'role', 'Faculty',
      'department', 'Pharmacy',
      'teaching_load', 'NONE',
      'credential_type', 'TEMPORARY',
      'migration', '20260929120000_pharmacy_riya_faculty_credential.sql'
    ),
    v_user
  );
END $$;

COMMIT;

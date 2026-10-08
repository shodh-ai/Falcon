-- Correct student accounts provisioned as Faculty via Google OAuth before department import.
-- Matches enrollment-style emails: name.enrollmentNo@domain (5+ digit roll segment).

DO $$
DECLARE
  v_student_role INT;
  v_fixed INT := 0;
BEGIN
  SELECT role_id INTO v_student_role FROM roles WHERE role_name = 'Student' LIMIT 1;
  IF v_student_role IS NULL THEN
    RAISE NOTICE 'Student role missing — skipping google faculty role correction';
    RETURN;
  END IF;

  WITH targets AS (
    SELECT u.user_id,
           sp.user_id IS NOT NULL AS has_profile
    FROM users u
    INNER JOIN roles r ON r.role_id = u.role_id
    LEFT JOIN student_profiles sp ON sp.user_id = u.user_id AND sp.tenant_id = u.tenant_id
    WHERE u.deleted_at IS NULL
      AND u.is_active = true
      AND r.role_name IN ('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin')
      AND u.official_email ~* '^[^@]*\.\d{5,}@'
  ),
  updated AS (
    UPDATE users u
    SET role_id = v_student_role,
        onboarding_status = CASE
          WHEN t.has_profile THEN 'COMPLETED'
          WHEN u.onboarding_status IN (
            'COMPLETED', 'PENDING_ADMIN_APPROVAL', 'PENDING_DOCUMENTS', 'PENDING_PASSWORD_RESET'
          ) THEN u.onboarding_status
          ELSE u.onboarding_status
        END,
        updated_at = NOW()
    FROM targets t
    WHERE u.user_id = t.user_id
    RETURNING u.user_id
  )
  SELECT count(*)::int INTO v_fixed FROM updated;

  DELETE FROM user_roles ur
  USING roles r, users u
  WHERE ur.user_id = u.user_id
    AND ur.role_id = r.role_id
    AND r.role_name IN ('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin')
    AND u.official_email ~* '^[^@]*\.\d{5,}@'
    AND EXISTS (
      SELECT 1 FROM users u2
      INNER JOIN roles rs ON rs.role_id = u2.role_id
      WHERE u2.user_id = u.user_id AND rs.role_name = 'Student'
    );

  INSERT INTO user_roles (user_id, role_id, is_primary)
  SELECT u.user_id, v_student_role, true
  FROM users u
  INNER JOIN roles r ON r.role_id = u.role_id
  WHERE r.role_name = 'Student'
    AND u.official_email ~* '^[^@]*\.\d{5,}@'
  ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

  RAISE NOTICE 'Corrected % Google-provisioned student account(s) from staff role to Student', v_fixed;
END $$;

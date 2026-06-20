-- Master Dean persona for QA smoke tests (password: password123)
-- Mirrors registrar@ / hod@ master persona pattern.

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
dean_role AS (
  SELECT role_id FROM roles WHERE role_name = 'Dean' LIMIT 1
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id,
  password_hash, salary_base, reporting_officer_id, is_active, onboarding_status
)
SELECT
  'b000000f-0000-4000-8000-00000000000f'::uuid,
  t.tenant_id,
  'Dean of Engineering',
  'dean@mygyanvihar.com',
  dr.role_id,
  p.hash,
  120000.00,
  'b000000a-0000-4000-8000-00000000000a'::uuid,
  true,
  'ACTIVE'
FROM tenant t, pwd p, dean_role dr
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  password_hash = EXCLUDED.password_hash,
  salary_base = EXCLUDED.salary_base,
  reporting_officer_id = EXCLUDED.reporting_officer_id,
  is_active = true,
  onboarding_status = 'ACTIVE';

-- Trigger trg_users_portal_onboarding_defaults forces PENDING_PASSWORD_RESET on INSERT for Dean;
-- master QA personas (hod@, faculty1@) use ACTIVE so smoke login skips the wizard.
UPDATE users u
SET onboarding_status = 'ACTIVE', updated_at = NOW()
FROM public.tenants t
WHERE u.tenant_id = t.tenant_id
  AND t.subdomain = 'sgvu'
  AND lower(u.official_email) = 'dean@mygyanvihar.com';

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u
JOIN public.tenants t ON t.tenant_id = u.tenant_id AND t.subdomain = 'sgvu'
WHERE lower(u.official_email) = 'dean@mygyanvihar.com'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'hr_employee_profiles'
  ) THEN
    INSERT INTO hr_employee_profiles (
      tenant_id, user_id, employee_id, designation, joining_date, entity_id
    )
    SELECT
      u.tenant_id,
      u.user_id,
      'SGVU-DEAN-001',
      'Dean of Engineering',
      CURRENT_DATE,
      oe.entity_id
    FROM users u
    JOIN public.tenants t ON t.tenant_id = u.tenant_id AND t.subdomain = 'sgvu'
    JOIN org_entities oe ON oe.tenant_id = u.tenant_id AND oe.entity_code = 'SGVU_UNIVERSITY'
    WHERE lower(u.official_email) = 'dean@mygyanvihar.com'
      AND NOT EXISTS (
        SELECT 1 FROM hr_employee_profiles hep
        WHERE hep.tenant_id = u.tenant_id AND hep.user_id = u.user_id
      );
  END IF;
END $$;

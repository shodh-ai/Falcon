-- Complete the two previously pending Pharmacy faculty identities.
-- Plaintext temporary passwords are deliberately excluded from source control.

BEGIN;

CREATE TEMP TABLE pharmacy_pending_faculty (
  proposed_user_id UUID NOT NULL,
  employee_id VARCHAR(50) NOT NULL,
  faculty_name VARCHAR(255) NOT NULL,
  official_email VARCHAR(255) NOT NULL,
  previous_email VARCHAR(255),
  designation VARCHAR(140) NOT NULL,
  joining_date DATE NOT NULL,
  password_hash VARCHAR(255) NOT NULL
) ON COMMIT DROP;

INSERT INTO pharmacy_pending_faculty
  (proposed_user_id, employee_id, faculty_name, official_email, previous_email, designation, joining_date, password_hash)
VALUES
  ('30e9f326-997c-47ea-916c-9bbd05386d36'::uuid, '1122', 'Preeti Khulbe', 'preeti.khulbe@mygyanvihar.com', NULL, 'Associate Professor', '2019-03-01'::date, '$2b$12$JrOEEN14pWYL23PZaWUCn.86jFjloI1aGZkvX9bRF4xFt4IH26NBO'),
  ('7dec95d9-8eaa-4dba-9d2f-3337096bb830'::uuid, '2620', 'Vivek Gupta', 'vivek.gupta@mygyanvihar.com', 'siaram.vivek@gmail.com', 'Professor', '2026-07-01'::date, '$2b$12$zv6WwH5jmYL6qzSJUVjrW.xLDcNOQCdHuui6H.k.4lpAf6bRaOHQu');

DO $$
DECLARE
  conflict_count INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE subdomain = 'sgvu' AND is_active = true) THEN
    RAISE EXCEPTION 'Active SGVU tenant is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM departments WHERE lower(dept_name) = 'pharmacy') THEN
    RAISE EXCEPTION 'Pharmacy department is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM roles WHERE role_name = 'Faculty') THEN
    RAISE EXCEPTION 'Faculty role is required';
  END IF;

  SELECT COUNT(*) INTO conflict_count
  FROM pharmacy_pending_faculty p
  JOIN public.tenants t ON t.subdomain = 'sgvu'
  JOIN users email_user
    ON email_user.tenant_id = t.tenant_id
   AND lower(email_user.official_email) = lower(p.official_email)
  JOIN hr_employee_profiles ep
    ON ep.tenant_id = t.tenant_id
   AND ep.employee_id = p.employee_id
  WHERE email_user.user_id <> ep.user_id;

  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'Official email and employee ID resolve to different users';
  END IF;
END $$;

CREATE TEMP TABLE pharmacy_resolved_faculty ON COMMIT DROP AS
WITH tenant_ctx AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' AND is_active = true LIMIT 1
)
SELECT
  p.*,
  COALESCE(
    (SELECT ep.user_id
       FROM hr_employee_profiles ep, tenant_ctx t
      WHERE ep.tenant_id = t.tenant_id AND ep.employee_id = p.employee_id
      LIMIT 1),
    (SELECT u.user_id
       FROM users u, tenant_ctx t
      WHERE u.tenant_id = t.tenant_id
        AND lower(u.official_email) IN (lower(p.official_email), lower(COALESCE(p.previous_email, p.official_email)))
      ORDER BY CASE WHEN lower(u.official_email) = lower(p.official_email) THEN 0 ELSE 1 END
      LIMIT 1),
    p.proposed_user_id
  ) AS resolved_user_id
FROM pharmacy_pending_faculty p;

WITH ctx AS (
  SELECT t.tenant_id, d.dept_id
  FROM public.tenants t
  CROSS JOIN LATERAL (
    SELECT dept_id FROM departments WHERE lower(dept_name) = 'pharmacy' ORDER BY dept_id LIMIT 1
  ) d
  WHERE t.subdomain = 'sgvu' AND t.is_active = true
  LIMIT 1
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, is_active, onboarding_status, onboarding_profile,
  account_status, deleted_at, updated_at
)
SELECT
  p.resolved_user_id,
  ctx.tenant_id,
  p.faculty_name,
  lower(p.official_email),
  r.role_id,
  ctx.dept_id,
  p.password_hash,
  true,
  'PENDING_PASSWORD_RESET',
  '{}'::jsonb,
  'ACTIVE',
  NULL,
  NOW()
FROM pharmacy_resolved_faculty p
CROSS JOIN ctx
JOIN roles r ON r.role_name = 'Faculty'
ON CONFLICT (user_id) DO UPDATE SET
  name = EXCLUDED.name,
  official_email = EXCLUDED.official_email,
  role_id = EXCLUDED.role_id,
  dept_id = EXCLUDED.dept_id,
  password_hash = EXCLUDED.password_hash,
  is_active = true,
  onboarding_status = 'PENDING_PASSWORD_RESET',
  onboarding_profile = '{}'::jsonb,
  account_status = 'ACTIVE',
  deleted_at = NULL,
  updated_at = NOW();

WITH target_users AS (
  SELECT u.user_id
  FROM users u
  JOIN public.tenants t ON t.tenant_id = u.tenant_id AND t.subdomain = 'sgvu'
  JOIN pharmacy_resolved_faculty p ON p.resolved_user_id = u.user_id
)
UPDATE user_roles ur
SET is_primary = false
FROM target_users tu
WHERE ur.user_id = tu.user_id AND ur.is_primary = true;

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT p.resolved_user_id, r.role_id, true
FROM pharmacy_resolved_faculty p
JOIN roles r ON r.role_name = 'Faculty'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = true;

WITH ctx AS (
  SELECT
    t.tenant_id,
    COALESCE(
      (SELECT oe.entity_id FROM org_entities oe WHERE oe.tenant_id = t.tenant_id AND oe.entity_code = 'SGVU_UNIVERSITY' AND oe.is_active = true LIMIT 1),
      (SELECT oe.entity_id FROM org_entities oe WHERE oe.tenant_id = t.tenant_id AND oe.is_active = true ORDER BY oe.entity_id LIMIT 1)
    ) AS entity_id
  FROM public.tenants t
  WHERE t.subdomain = 'sgvu'
  LIMIT 1
)
INSERT INTO hr_employee_profiles (
  tenant_id, user_id, employee_id, designation, joining_date,
  entity_id, shift_id, week_off_day, updated_at
)
SELECT
  ctx.tenant_id,
  p.resolved_user_id,
  p.employee_id,
  p.designation,
  p.joining_date,
  ctx.entity_id,
  (SELECT shift_id FROM hr_shifts WHERE shift_name = 'Faculty 9-4' AND entity_id = ctx.entity_id LIMIT 1),
  0,
  NOW()
FROM pharmacy_resolved_faculty p
CROSS JOIN ctx
ON CONFLICT (tenant_id, user_id) DO UPDATE SET
  employee_id = EXCLUDED.employee_id,
  designation = EXCLUDED.designation,
  joining_date = EXCLUDED.joining_date,
  entity_id = COALESCE(EXCLUDED.entity_id, hr_employee_profiles.entity_id),
  shift_id = COALESCE(EXCLUDED.shift_id, hr_employee_profiles.shift_id),
  week_off_day = EXCLUDED.week_off_day,
  updated_at = NOW();

UPDATE users u
SET entity_id = ep.entity_id, reporting_officer_id = hod.user_id, updated_at = NOW()
FROM hr_employee_profiles ep
JOIN pharmacy_resolved_faculty p ON p.resolved_user_id = ep.user_id
JOIN public.tenants t ON t.tenant_id = ep.tenant_id AND t.subdomain = 'sgvu'
JOIN users hod ON hod.tenant_id = t.tenant_id AND lower(hod.official_email) = 'hitesh.kumar@mygyanvihar.com'
WHERE u.user_id = p.resolved_user_id
  AND u.tenant_id = ep.tenant_id;

INSERT INTO user_entity_access (user_id, entity_id)
SELECT ep.user_id, ep.entity_id
FROM hr_employee_profiles ep
JOIN pharmacy_resolved_faculty p ON p.resolved_user_id = ep.user_id
WHERE ep.entity_id IS NOT NULL
ON CONFLICT (user_id, entity_id) DO NOTHING;

DO $$
DECLARE
  provisioned_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO provisioned_count
  FROM pharmacy_resolved_faculty p
  JOIN users u ON u.user_id = p.resolved_user_id
  JOIN public.tenants t ON t.tenant_id = u.tenant_id AND t.subdomain = 'sgvu'
  JOIN hr_employee_profiles ep ON ep.tenant_id = u.tenant_id AND ep.user_id = u.user_id
  JOIN roles r ON r.role_id = u.role_id
  WHERE lower(u.official_email) = lower(p.official_email)
    AND ep.employee_id = p.employee_id
    AND u.password_hash = p.password_hash
    AND u.onboarding_status = 'PENDING_PASSWORD_RESET'
    AND u.is_active = true
    AND r.role_name = 'Faculty';

  IF provisioned_count <> 2 THEN
    RAISE EXCEPTION 'Expected 2 completed Pharmacy faculty identities, found %', provisioned_count;
  END IF;
END $$;

COMMIT;

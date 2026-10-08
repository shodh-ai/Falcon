-- Provision the verified Gyan Vihar School of Pharmacy faculty roster.
-- Plaintext temporary passwords are deliberately excluded from source control.
-- Preeti Khulbe and Vivek Gupta remain pending required identity data.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE subdomain = 'sgvu' AND is_active = true) THEN
    RAISE EXCEPTION 'Active SGVU tenant is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM departments WHERE lower(dept_name) = 'pharmacy') THEN
    RAISE EXCEPTION 'Pharmacy department is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM roles WHERE role_name = 'Faculty')
     OR NOT EXISTS (SELECT 1 FROM roles WHERE role_name = 'HOD') THEN
    RAISE EXCEPTION 'Faculty and HOD roles are required';
  END IF;
END $$;

CREATE TEMP TABLE pharmacy_faculty_provisioning (
  user_id UUID NOT NULL,
  employee_id VARCHAR(50) NOT NULL,
  faculty_name VARCHAR(255) NOT NULL,
  official_email VARCHAR(255) NOT NULL,
  designation VARCHAR(140) NOT NULL,
  joining_date DATE NOT NULL,
  role_name VARCHAR(50) NOT NULL,
  password_hash VARCHAR(255) NOT NULL
) ON COMMIT DROP;

INSERT INTO pharmacy_faculty_provisioning
  (user_id, employee_id, faculty_name, official_email, designation, joining_date, role_name, password_hash)
VALUES
  ('ea9a3c2f-72e1-4eb8-9bb0-dc1b6a8dac9b'::uuid, '4144', 'Nidhi Chauhan', 'nidhi.chauhan@mygyanvihar.com', 'Assistant Professor', '2021-01-28'::date, 'Faculty', '$2b$12$EP9xLVUjtRvHGOkkL5NN.e0OArWIzR0uO8hSa12eEM1XcQqIb7O72'),
  ('30dfb760-8a3c-48c6-aee5-fc0c9e9e9433'::uuid, '4178', 'Mahendra Saini', 'mahendra.saini@mygyanvihar.com', 'Assistant Professor', '2021-03-12'::date, 'Faculty', '$2b$12$RurkPCL/Wt38dudKQHu1aeR.EZJfDGZJiRkz058yQhp3iMzchVi1O'),
  ('3573883d-04af-41dd-8dc0-0c5b671a8262'::uuid, '4402', 'Priya Sen', 'priya.sen@mygyanvihar.com', 'Assistant Professor', '2021-12-16'::date, 'Faculty', '$2b$12$rPb7tmOrHydhA0iz4MpXYeLi3PlsByFcbUgxish4035AYR7TqJ3ee'),
  ('eb9b76c2-b1a9-48de-a6a0-57b2f8bd4221'::uuid, '4423', 'Manish Gupta', 'manish.gupta@mygyanvihar.com', 'Assistant Professor', '2022-02-01'::date, 'Faculty', '$2b$12$k169Q.iBGBcgnNaKDZS1.edxKhte6NiBWoPStD2lQqzlwmAYaDPIS'),
  ('e86dea9e-b9e8-4f28-bb23-f821e2841f34'::uuid, '4443', 'Neeraj Patel', 'neeraj.patel@mygyanvihar.com', 'Assistant Professor', '2022-03-09'::date, 'Faculty', '$2b$12$Im.xifvYgga554677I9lZ.AtQLXzS.rbtmUxAomyMcm5IR2odVd1C'),
  ('142160f4-f137-41c0-aeef-fd9fcdc35922'::uuid, '4495', 'Aishwarya Rathore', 'aishwarya.rathore@mygyanvihar.com', 'Assistant Professor', '2022-05-02'::date, 'Faculty', '$2b$12$0NySGNSBr1GFPnSuZOo3TOF3OxWF6zSoUH4KVeKeX5qrgzaMDrkHq'),
  ('09caf295-082d-4578-8c5f-52659eadd023'::uuid, '4632', 'Yogesh Matta', 'yogesh.matta@mygyanvihar.com', 'Assistant Professor', '2022-11-16'::date, 'Faculty', '$2b$12$rRPf7HQ7WtZaDZi0UwebmeL9rJm3RT3E3I0QhdMGcQqXeG7y2Qw1i'),
  ('a4ee480e-e964-459c-ba43-d721cce9bdb4'::uuid, '5423', 'Alisha Singh', 'alisha.singh@mygyanvihar.com', 'Associate Professor', '2026-07-01'::date, 'Faculty', '$2b$12$/JxuSfaWuMkXHdgZS0kId.rjP2z4xE0gmLmlDMYRnWs8vS3rtYjIy'),
  ('79408fda-d959-4507-8583-c54f0e08be63'::uuid, '4899', 'Neha Arora', 'neha.arora@mygyanvihar.com', 'Assistant Professor', '2023-12-15'::date, 'Faculty', '$2b$12$6o99lkb18O2AL6rL2dkEpurfZDkXoEyIbjM10nQu7n9n9wv9zRmFW'),
  ('85c3dad9-f688-45ac-90dd-8bc8a15990c7'::uuid, '4905', 'Tapasvi Gupta', 'tapasvi.gupta@mygyanvihar.com', 'Associate Professor', '2023-12-26'::date, 'Faculty', '$2b$12$joD6NGSNPAvZFwaOSr7hhusI6GbpMiJ1gnrNdMmpRBVPielHX/UA6'),
  ('f165159a-dab2-499b-a82d-19d9a17f4d8a'::uuid, '4911', 'Shalu Jain', 'shalu.jain@mygyanvihar.com', 'Assistant Professor', '2025-07-03'::date, 'Faculty', '$2b$12$KGovp7EgXDfQOrb0NJ1s3.p0OpkVO1gBWi0VsCxfZhb5gPpF6U.Tq'),
  ('e55e7aa5-a1a4-493c-871c-d32fb0f9b165'::uuid, '4912', 'Prashant Kumar Dhakad', 'prashantkr.dhakad@mygyanvihar.com', 'Professor', '2024-01-08'::date, 'Faculty', '$2b$12$E/jQFI8coOt1m3yYAYPtTe/mqX/ipU4qWzW7ijk5SAo/ria.i8SW6'),
  ('0f9f7a1a-30d8-4856-b935-b5b0fd91a575'::uuid, '5038', 'Animesh Kumar Gupta', 'animesh.kumar@mygyanvihar.com', 'Assistant Professor', '2024-07-11'::date, 'Faculty', '$2b$12$nw34jdZh6p.9Y/WIF1FaOelLVvGozmbCKjedbPwAps2CSMe2Gfmxe'),
  ('e4722b66-97e0-4159-8120-8be42ea2b580'::uuid, '5091', 'Hitesh Kumar Kinger', 'hitesh.kumar@mygyanvihar.com', 'Professor / HOD', '2024-09-04'::date, 'HOD', '$2b$12$zVoyobgEOJDPIRV92fZ7yuxtqq0hUCdN4SfFpxi5wBF9ySpQrSdg.'),
  ('ee729e0d-bf2f-40ae-8839-61e0531cbbf6'::uuid, '5138', 'Nisha Yadav', 'nisha.yadav@mygyanvihar.com', 'Assistant Professor', '2024-11-05'::date, 'Faculty', '$2b$12$8xe8jU.FQCB50FCKvm7RG.043ZWMffds7JOyfpps4wFGfKs4MRFE2'),
  ('b09d7874-087b-44bc-8c6b-5e4c3c4fd260'::uuid, '4927', 'Muskan Jain', 'muskan.jain@mygyanvihar.com', 'Lecturer', '2025-08-01'::date, 'Faculty', '$2b$12$65aqd0eLHPV4fi525JlVR.8Q5FYSpnAOP0u8lt42Kax8xHU42H3aG'),
  ('fad46613-94e9-4db4-8914-aa94b3e91376'::uuid, '5302', 'Arjun Singh Kaushik', 'arjun.kaushik@mygyanvihar.com', 'Assistant Professor', '2025-09-12'::date, 'Faculty', '$2b$12$pFldBe1mrtEqbMdNUydFtOcmP/yekfiBmALGSttzZfqj79YpSICXK'),
  ('053a5738-3e58-409d-99c5-fbd3a4dee46a'::uuid, '5304', 'Sandeep Kumar', 'sandeep.kumar@mygyanvihar.com', 'Assistant Professor', '2025-09-13'::date, 'Faculty', '$2b$12$vdkYPGrJrxvpDb4XyQw39uW6kxhzz2XjrSzrBqLO45QqGilCtKYD6'),
  ('1212e400-5db0-42a3-92e3-f0792e158cd1'::uuid, '5305', 'Charu Misra', 'charu.misra@mygyanvihar.com', 'Assistant Professor', '2025-09-13'::date, 'Faculty', '$2b$12$CVW9.vjo9Kcr.x.PH3sfou0ZsJRamQ0K/cWyqq0J7//j0gfBp6Uoi'),
  ('c04290b7-66bd-45c3-b573-2ca63031eede'::uuid, '5339', 'Samarpan Mishra', 'samarpan.mishra@mygyanvihar.com', 'Assistant Professor', '2025-12-22'::date, 'Faculty', '$2b$12$9uKAP5XJAXXwgGJZXneLwu2dvwp1lRs9mZDsxcPUzMEKNnhUMDTce'),
  ('8a5b8349-a79b-475f-b961-477ee28aa698'::uuid, '5356', 'Supriya Sarkar', 'supriya.sarkar@mygyanvihar.com', 'Assistant Professor', '2026-01-17'::date, 'Faculty', '$2b$12$c3IetSFzBVinx/f2qtQ4YentvwfmNkRo6ouep9.rxFi.rIR8rDaYS'),
  ('d91cec92-449e-4090-8673-aac54f809a42'::uuid, '5359', 'Manish Kumar Gupta', 'manish1.gupta@mygyanvihar.com', 'Professor', '2026-01-20'::date, 'Faculty', '$2b$12$tUQb83qNLfI0dEXRI4/IT.Oaylk4UuZqk2H5xoR1XbSkeF0mdh1du'),
  ('60134e47-7b92-496d-a145-e02b458826cc'::uuid, '5374', 'Amit Kaushik', 'amit.kaushik@mygyanvihar.com', 'Associate Professor', '2026-02-11'::date, 'Faculty', '$2b$12$KVYKwOR.SHMVhdC0L.ErCudz5mzzfBLL2yGa3SdUrDnBjFv/.Ti86'),
  ('b03e358a-fa11-4026-bc46-36ef99779e83'::uuid, '5381', 'KM Abha Mishra', 'abha.mishra@mygyanvihar.com', 'Assistant Professor', '2026-02-23'::date, 'Faculty', '$2b$12$/wKEyqZTI9R3aGp8dWPRMOTqEA1e2MLwFn1mh9M5JA8SeRelvAvc6'),
  ('eefd34d6-c6a5-4dfa-b50c-19e811b7a5ff'::uuid, '5483', 'Shikha Kandpal', 'shikha.kandpal@mygyanvihar.com', 'Assistant Professor', '2026-09-12'::date, 'Faculty', '$2b$12$tf/BHNLMnuE9rTG1vWwPYuT0RQyHL4aNl2aE8qZi1DlL9axIplU1i'),
  ('e9ca0819-82ec-4bd5-b0fe-2855c105b467'::uuid, '5484', 'Gauri Gupta', 'gauri.gupta@mygyanvihar.com', 'Assistant Professor', '2026-09-15'::date, 'Faculty', '$2b$12$C8Knsqiqs4Qw6bYj7EGJieUrjZZuUsJAKO4CD1a1tqxhaM6VImn3u');

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
  p.user_id,
  ctx.tenant_id,
  p.faculty_name,
  p.official_email,
  r.role_id,
  ctx.dept_id,
  p.password_hash,
  true,
  'PENDING_PASSWORD_RESET',
  '{}'::jsonb,
  'ACTIVE',
  NULL,
  NOW()
FROM pharmacy_faculty_provisioning p
CROSS JOIN ctx
JOIN roles r ON r.role_name = p.role_name
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
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
  JOIN pharmacy_faculty_provisioning p ON lower(p.official_email) = lower(u.official_email)
)
UPDATE user_roles ur
SET is_primary = false
FROM target_users tu
WHERE ur.user_id = tu.user_id AND ur.is_primary = true;

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, r.role_id, true
FROM users u
JOIN public.tenants t ON t.tenant_id = u.tenant_id AND t.subdomain = 'sgvu'
JOIN pharmacy_faculty_provisioning p ON lower(p.official_email) = lower(u.official_email)
JOIN roles r ON r.role_name = p.role_name
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
), staff AS (
  SELECT
    u.user_id,
    u.tenant_id,
    p.employee_id,
    p.designation,
    p.joining_date,
    ctx.entity_id,
    (SELECT shift_id FROM hr_shifts WHERE shift_name = 'Faculty 9-4' AND entity_id = ctx.entity_id LIMIT 1) AS shift_id
  FROM users u
  JOIN pharmacy_faculty_provisioning p ON lower(p.official_email) = lower(u.official_email)
  JOIN ctx ON ctx.tenant_id = u.tenant_id
)
INSERT INTO hr_employee_profiles (
  tenant_id, user_id, employee_id, designation, joining_date,
  entity_id, shift_id, week_off_day, updated_at
)
SELECT
  s.tenant_id, s.user_id, s.employee_id, s.designation, s.joining_date,
  s.entity_id, s.shift_id, 0, NOW()
FROM staff s
ON CONFLICT (tenant_id, user_id) DO UPDATE SET
  employee_id = EXCLUDED.employee_id,
  designation = EXCLUDED.designation,
  joining_date = EXCLUDED.joining_date,
  entity_id = COALESCE(EXCLUDED.entity_id, hr_employee_profiles.entity_id),
  shift_id = COALESCE(EXCLUDED.shift_id, hr_employee_profiles.shift_id),
  week_off_day = EXCLUDED.week_off_day,
  updated_at = NOW();

UPDATE users u
SET entity_id = p.entity_id, updated_at = NOW()
FROM hr_employee_profiles p
JOIN pharmacy_faculty_provisioning f ON f.employee_id = p.employee_id
WHERE p.user_id = u.user_id
  AND p.tenant_id = u.tenant_id
  AND p.entity_id IS NOT NULL;

INSERT INTO user_entity_access (user_id, entity_id)
SELECT p.user_id, p.entity_id
FROM hr_employee_profiles p
JOIN pharmacy_faculty_provisioning f ON f.employee_id = p.employee_id
WHERE p.entity_id IS NOT NULL
ON CONFLICT (user_id, entity_id) DO NOTHING;

WITH hod AS (
  SELECT u.user_id, u.tenant_id, u.dept_id
  FROM users u
  JOIN public.tenants t ON t.tenant_id = u.tenant_id AND t.subdomain = 'sgvu'
  WHERE lower(u.official_email) = 'hitesh.kumar@mygyanvihar.com'
  LIMIT 1
)
UPDATE users u
SET reporting_officer_id = hod.user_id, updated_at = NOW()
FROM hod
JOIN pharmacy_faculty_provisioning f ON true
WHERE u.tenant_id = hod.tenant_id
  AND u.dept_id = hod.dept_id
  AND lower(u.official_email) = lower(f.official_email)
  AND u.user_id <> hod.user_id;

UPDATE departments d
SET hod_user_id = u.user_id, updated_at = NOW()
FROM users u
JOIN public.tenants t ON t.tenant_id = u.tenant_id AND t.subdomain = 'sgvu'
WHERE lower(d.dept_name) = 'pharmacy'
  AND lower(u.official_email) = 'hitesh.kumar@mygyanvihar.com';

UPDATE users u
SET
  is_active = false,
  onboarding_status = 'EXITED',
  account_status = 'SUSPENDED',
  updated_at = NOW()
FROM public.tenants t
WHERE u.tenant_id = t.tenant_id
  AND t.subdomain = 'sgvu'
  AND lower(u.official_email) IN (
    'debkantha.gope@mygynavihar.com',
    'debkantha.gope@mygyanvihar.com'
  );

DO $$
DECLARE
  provisioned_count INTEGER;
  hod_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO provisioned_count
  FROM users u
  JOIN public.tenants t ON t.tenant_id = u.tenant_id AND t.subdomain = 'sgvu'
  JOIN pharmacy_faculty_provisioning p ON lower(p.official_email) = lower(u.official_email)
  WHERE u.is_active = true
    AND u.password_hash = p.password_hash
    AND u.onboarding_status = 'PENDING_PASSWORD_RESET';

  SELECT COUNT(*) INTO hod_count
  FROM users u
  JOIN roles r ON r.role_id = u.role_id
  WHERE lower(u.official_email) = 'hitesh.kumar@mygyanvihar.com'
    AND r.role_name = 'HOD'
    AND u.is_active = true;

  IF provisioned_count <> 26 THEN
    RAISE EXCEPTION 'Expected 26 provisioned Pharmacy faculty, found %', provisioned_count;
  END IF;
  IF hod_count <> 1 THEN
    RAISE EXCEPTION 'Expected Hitesh Kumar Kinger to be the active Pharmacy HOD';
  END IF;
END $$;

COMMIT;

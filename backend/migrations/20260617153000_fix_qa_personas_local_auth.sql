-- Repair QA dev personas and add missing master Registrar account for local password login.
-- Password for all: password123

-- Remove orphan dev rows inserted before multi-tenant (NULL tenant_id blocks localLogin).
DELETE FROM users
WHERE tenant_id IS NULL
  AND lower(official_email) LIKE 'dev.%@mygyanvihar.com';

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
dept AS (
  SELECT dept_id FROM departments WHERE dept_name = 'Computer Science' LIMIT 1
),
dev_users AS (
  SELECT * FROM (VALUES
    ('Dev Accountant',         'dev.accountant@mygyanvihar.com',         'Accountant',         'dev-accountant'),
    ('Dev Admissions Officer', 'dev.admissionsofficer@mygyanvihar.com',  'AdmissionsOfficer',  'dev-admissionsofficer'),
    ('Dev Dean',               'dev.dean@mygyanvihar.com',               'Dean',               'dev-dean'),
    ('Dev Faculty',            'dev.faculty@mygyanvihar.com',            'Faculty',            'dev-faculty'),
    ('Dev HOD',                'dev.hod@mygyanvihar.com',                'HOD',                'dev-hod'),
    ('Dev HR',                 'dev.hr@mygyanvihar.com',                 'HR',                 'dev-hr'),
    ('Dev IQAC',               'dev.iqac@mygyanvihar.com',               'IQAC',               'dev-iqac'),
    ('Dev Librarian',          'dev.librarian@mygyanvihar.com',          'Librarian',          'dev-librarian'),
    ('Dev Placement Cell',     'dev.placementcell@mygyanvihar.com',      'PlacementCell',      'dev-placementcell'),
    ('Dev President',          'dev.president@mygyanvihar.com',          'President',          'dev-president'),
    ('Dev Registrar',          'dev.registrar@mygyanvihar.com',          'Registrar',          'dev-registrar'),
    ('Dev Super Admin',        'dev.superadmin@mygyanvihar.com',         'SuperAdmin',         'dev-superadmin'),
    ('Dev Transport Officer',  'dev.transportofficer@mygyanvihar.com',   'TransportOfficer',   'dev-transportofficer'),
    ('Dev Warden',             'dev.warden@mygyanvihar.com',             'Warden',             'dev-warden')
  ) AS u(name, email, role_name, google_id)
)
INSERT INTO users (
  tenant_id, name, official_email, role_id, dept_id, google_id,
  password_hash, is_active
)
SELECT
  t.tenant_id,
  d.name,
  d.email,
  r.role_id,
  CASE WHEN d.role_name IN ('Faculty', 'HOD') THEN dept.dept_id ELSE NULL END,
  d.google_id,
  p.hash,
  true
FROM dev_users d
CROSS JOIN tenant t
CROSS JOIN pwd p
LEFT JOIN dept ON true
JOIN roles r ON r.role_name = d.role_name
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  dept_id = COALESCE(EXCLUDED.dept_id, users.dept_id),
  google_id = EXCLUDED.google_id,
  password_hash = EXCLUDED.password_hash,
  is_active = true;

-- Master Registrar persona (mirrors library@ pattern)
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
registrar_role AS (SELECT role_id FROM roles WHERE role_name = 'Registrar' LIMIT 1)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id,
  password_hash, salary_base, is_active
)
SELECT
  'b000000d-0000-4000-8000-00000000000d'::uuid,
  t.tenant_id,
  'University Registrar',
  'registrar@mygyanvihar.com',
  rr.role_id,
  p.hash,
  92000.00,
  true
FROM tenant t, pwd p, registrar_role rr
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  password_hash = EXCLUDED.password_hash,
  is_active = true;

-- Ensure library@ master persona always has password (idempotent safety net)
UPDATE users u
SET password_hash = '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'
FROM public.tenants t
WHERE u.tenant_id = t.tenant_id
  AND t.subdomain = 'sgvu'
  AND lower(u.official_email) = 'library@mygyanvihar.com'
  AND u.password_hash IS NULL;

-- user_roles for dev personas + registrar master
INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u
JOIN public.tenants t ON t.tenant_id = u.tenant_id AND t.subdomain = 'sgvu'
WHERE lower(u.official_email) IN (
  'dev.accountant@mygyanvihar.com',
  'dev.admissionsofficer@mygyanvihar.com',
  'dev.dean@mygyanvihar.com',
  'dev.faculty@mygyanvihar.com',
  'dev.hod@mygyanvihar.com',
  'dev.hr@mygyanvihar.com',
  'dev.iqac@mygyanvihar.com',
  'dev.librarian@mygyanvihar.com',
  'dev.placementcell@mygyanvihar.com',
  'dev.president@mygyanvihar.com',
  'dev.registrar@mygyanvihar.com',
  'dev.superadmin@mygyanvihar.com',
  'dev.transportofficer@mygyanvihar.com',
  'dev.warden@mygyanvihar.com',
  'registrar@mygyanvihar.com'
)
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

-- Optional HR profiles (skip when table/columns differ across migration states)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'hr_employee_profiles'
  ) THEN
    INSERT INTO hr_employee_profiles (
      tenant_id, user_id, employee_id, designation, joining_date
    )
    SELECT
      u.tenant_id,
      u.user_id,
      data.employee_id,
      data.designation,
      CURRENT_DATE
    FROM users u
    JOIN public.tenants t ON t.tenant_id = u.tenant_id AND t.subdomain = 'sgvu'
    JOIN (VALUES
      ('dev.accountant@mygyanvihar.com',         'Accounts Officer',     'SGVU-DEV-ACC-001'),
      ('dev.admissionsofficer@mygyanvihar.com',  'Admissions Officer',   'SGVU-DEV-ADM-001'),
      ('dev.dean@mygyanvihar.com',               'Dean',                 'SGVU-DEV-DEAN-001'),
      ('dev.faculty@mygyanvihar.com',            'Assistant Professor',  'SGVU-DEV-FAC-001'),
      ('dev.hod@mygyanvihar.com',                'Head of Department',   'SGVU-DEV-HOD-001'),
      ('dev.hr@mygyanvihar.com',                 'HR Executive',         'SGVU-DEV-HR-001'),
      ('dev.iqac@mygyanvihar.com',               'IQAC Officer',         'SGVU-DEV-IQAC-01'),
      ('dev.librarian@mygyanvihar.com',          'Chief Librarian',      'SGVU-DEV-LIB-001'),
      ('dev.placementcell@mygyanvihar.com',      'Placement Officer',    'SGVU-DEV-PLC-001'),
      ('dev.president@mygyanvihar.com',          'Vice Chancellor',      'SGVU-DEV-VC-001'),
      ('dev.registrar@mygyanvihar.com',          'University Registrar', 'SGVU-DEV-REG-001'),
      ('dev.transportofficer@mygyanvihar.com',   'Transport Officer',    'SGVU-DEV-TRN-001'),
      ('dev.warden@mygyanvihar.com',             'Hostel Warden',        'SGVU-DEV-WAR-001'),
      ('registrar@mygyanvihar.com',              'University Registrar', 'SGVU-REG-001')
    ) AS data(email, designation, employee_id)
      ON lower(u.official_email) = lower(data.email)
    WHERE NOT EXISTS (
      SELECT 1 FROM hr_employee_profiles hep
      WHERE hep.tenant_id = u.tenant_id AND hep.user_id = u.user_id
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'hr_employee_profiles'
      AND column_name = 'entity_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'org_entities'
  ) THEN
    UPDATE users u
    SET entity_id = oe.entity_id
    FROM org_entities oe
    INNER JOIN public.tenants t ON t.tenant_id = oe.tenant_id AND t.subdomain = 'sgvu'
    WHERE oe.tenant_id = u.tenant_id
      AND oe.entity_code = 'SGVU_UNIVERSITY'
      AND u.entity_id IS NULL
      AND lower(u.official_email) IN (
        'dev.accountant@mygyanvihar.com',
        'dev.admissionsofficer@mygyanvihar.com',
        'dev.dean@mygyanvihar.com',
        'dev.faculty@mygyanvihar.com',
        'dev.hod@mygyanvihar.com',
        'dev.hr@mygyanvihar.com',
        'dev.iqac@mygyanvihar.com',
        'dev.librarian@mygyanvihar.com',
        'dev.placementcell@mygyanvihar.com',
        'dev.president@mygyanvihar.com',
        'dev.registrar@mygyanvihar.com',
        'dev.transportofficer@mygyanvihar.com',
        'dev.warden@mygyanvihar.com',
        'registrar@mygyanvihar.com'
      );

    UPDATE hr_employee_profiles hep
    SET entity_id = oe.entity_id
    FROM users u
    JOIN org_entities oe ON oe.tenant_id = u.tenant_id AND oe.entity_code = 'SGVU_UNIVERSITY'
    JOIN public.tenants t ON t.tenant_id = u.tenant_id AND t.subdomain = 'sgvu'
    WHERE hep.user_id = u.user_id
      AND hep.tenant_id = u.tenant_id
      AND hep.entity_id IS NULL
      AND lower(u.official_email) IN (
        'dev.accountant@mygyanvihar.com',
        'dev.admissionsofficer@mygyanvihar.com',
        'dev.dean@mygyanvihar.com',
        'dev.faculty@mygyanvihar.com',
        'dev.hod@mygyanvihar.com',
        'dev.hr@mygyanvihar.com',
        'dev.iqac@mygyanvihar.com',
        'dev.librarian@mygyanvihar.com',
        'dev.placementcell@mygyanvihar.com',
        'dev.president@mygyanvihar.com',
        'dev.registrar@mygyanvihar.com',
        'dev.transportofficer@mygyanvihar.com',
        'dev.warden@mygyanvihar.com',
        'registrar@mygyanvihar.com'
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_entity_access'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'entity_id'
  ) THEN
    INSERT INTO user_entity_access (user_id, entity_id)
    SELECT u.user_id, u.entity_id
    FROM users u
    JOIN public.tenants t ON t.tenant_id = u.tenant_id AND t.subdomain = 'sgvu'
    WHERE u.entity_id IS NOT NULL
      AND lower(u.official_email) IN (
        'dev.accountant@mygyanvihar.com',
        'dev.admissionsofficer@mygyanvihar.com',
        'dev.dean@mygyanvihar.com',
        'dev.faculty@mygyanvihar.com',
        'dev.hod@mygyanvihar.com',
        'dev.hr@mygyanvihar.com',
        'dev.iqac@mygyanvihar.com',
        'dev.librarian@mygyanvihar.com',
        'dev.placementcell@mygyanvihar.com',
        'dev.president@mygyanvihar.com',
        'dev.registrar@mygyanvihar.com',
        'dev.transportofficer@mygyanvihar.com',
        'dev.warden@mygyanvihar.com',
        'registrar@mygyanvihar.com'
      )
    ON CONFLICT (user_id, entity_id) DO NOTHING;

    INSERT INTO user_entity_access (user_id, entity_id)
    SELECT u.user_id, oe.entity_id
    FROM users u
    JOIN public.tenants t ON t.tenant_id = u.tenant_id AND t.subdomain = 'sgvu'
    CROSS JOIN org_entities oe
    WHERE lower(u.official_email) = 'dev.superadmin@mygyanvihar.com'
      AND oe.tenant_id = u.tenant_id
      AND oe.is_active = true
    ON CONFLICT (user_id, entity_id) DO NOTHING;
  END IF;
END $$;

-- Map every school/department head to departments.hod_user_id, grant HOD portal access,
-- and activate onboarding so all HOD portals behave like CSE (Sohit).

-- Canonical CSE head remains Sohit (do not overwrite Computer Science).
UPDATE departments d
SET hod_user_id = u.user_id, updated_at = NOW()
FROM users u
WHERE d.dept_name = 'Computer Science'
  AND lower(u.official_email) = 'sohit@mygyanvihar.com';

-- School Deans / department heads from dean scope mapping.
UPDATE departments d
SET hod_user_id = u.user_id, updated_at = NOW()
FROM users u
WHERE d.dept_name IN (
  'Applied Sciences', 'CA', 'ISBM', 'SILS', 'Law', 'Education', 'Agriculture',
  'C3WR', 'Pharmacy', 'Mech Engg', 'BPT', 'GCAD', 'Civil', 'Clinical Psychology',
  'Electrical Engg'
)
  AND lower(u.official_email) = lower(
    CASE d.dept_name
      WHEN 'Applied Sciences' THEN 'gaurav.sharma@mygyanvihar.com'
      WHEN 'CA' THEN 'anil.pal@mygyanvihar.com'
      WHEN 'ISBM' THEN 'dean.isbm@mygyanvihar.com'
      WHEN 'SILS' THEN 'kalpana.randhawa@mygyanvihar.com'
      WHEN 'Law' THEN 'venoo.rajpurohit@mygyanvihar.com'
      WHEN 'Education' THEN 'shruti.tiwari@mygyanvihar.com'
      WHEN 'Agriculture' THEN 'ajeetsingh.shekhawat@mygyanvihar.com'
      WHEN 'C3WR' THEN 'suraj.kumar@mygyanvihar.com'
      WHEN 'Pharmacy' THEN 'hitesh.kumar@mygyanvihar.com'
      WHEN 'Mech Engg' THEN 'neeraj.kumar1@mygyanvihar.com'
      WHEN 'BPT' THEN 'gaurav.agarwal@mygyanvihar.com'
      WHEN 'GCAD' THEN 'gauri.sharma@mygyanvihar.com'
      WHEN 'Civil' THEN 'ravindra.budania@mygyanvihar.com'
      WHEN 'Clinical Psychology' THEN 'khushpreet.kaur@mygyanvihar.com'
      WHEN 'Electrical Engg' THEN 'paresh.jain@mygyanvihar.com'
    END
  );

-- Fallback: any user with primary HOD role and matching dept_id.
UPDATE departments d
SET hod_user_id = u.user_id, updated_at = NOW()
FROM users u
JOIN roles r ON r.role_id = u.role_id
WHERE r.role_name = 'HOD'
  AND u.dept_id = d.dept_id
  AND d.hod_user_id IS NULL
  AND d.dept_name <> 'Computer Science';

-- Secondary HOD role so department heads can call /api/academics/hod/* (RolesGuard).
INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT d.hod_user_id, r.role_id, false
FROM departments d
JOIN roles r ON r.role_name = 'HOD'
WHERE d.hod_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = d.hod_user_id AND ur.role_id = r.role_id
  );

-- Activate onboarding for department heads (smoke/demo login like Sohit).
UPDATE users u
SET onboarding_status = 'ACTIVE', updated_at = NOW()
FROM departments d
WHERE d.hod_user_id = u.user_id
  AND u.onboarding_status IS DISTINCT FROM 'ACTIVE';

-- Faculty in each department report to their HOD (Team Directory / ESS scope).
UPDATE users u
SET reporting_officer_id = d.hod_user_id, updated_at = NOW()
FROM departments d
WHERE u.dept_id = d.dept_id
  AND d.hod_user_id IS NOT NULL
  AND u.user_id <> d.hod_user_id
  AND EXISTS (
    SELECT 1 FROM roles r
    WHERE r.role_id = u.role_id AND r.role_name IN ('Faculty', 'HOD')
  )
  AND (u.reporting_officer_id IS NULL OR u.reporting_officer_id <> d.hod_user_id);

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'hod.department-heads-parity',
  'hod',
  'anil.pal@mygyanvihar.com',
  'department_head_mapping',
  'All school heads mapped to departments.hod_user_id + HOD role',
  'Ensures Anil Pal and every department HOD lands on the same HOD Command Center as Sohit.'
)
ON CONFLICT (smoke_key) DO UPDATE SET
  sample_record = EXCLUDED.sample_record,
  notes = EXCLUDED.notes,
  seeded_at = NOW();

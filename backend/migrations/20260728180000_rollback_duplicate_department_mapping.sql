-- Roll back effects of removed migration 20260708180000_department_hod_faculty_student_mapping.sql.
-- Team-owned school seed (20260703120000_school_test_credentials_seed.sql) remains source of truth.
-- Does NOT clear departments.hod_user_id or faculty reporting lines — team mapping owns those.

-- Re-enable legacy smoke/demo personas incorrectly deactivated by duplicate mapping.
UPDATE users
SET is_active = true,
    onboarding_status = CASE
      WHEN lower(official_email) IN ('hod@mygyanvihar.com', 'sohit@mygyanvihar.com') THEN 'ACTIVE'
      ELSE onboarding_status
    END,
    updated_at = NOW()
WHERE lower(official_email) IN (
  'hod@mygyanvihar.com',
  'faculty1@mygyanvihar.com', 'faculty2@mygyanvihar.com', 'faculty3@mygyanvihar.com',
  'faculty4@mygyanvihar.com', 'faculty5@mygyanvihar.com', 'faculty6@mygyanvihar.com',
  'faculty7@mygyanvihar.com', 'faculty8@mygyanvihar.com', 'faculty9@mygyanvihar.com',
  'faculty10@mygyanvihar.com', 'faculty11@mygyanvihar.com',
  'student1@mygyanvihar.com', 'student2@mygyanvihar.com', 'student3@mygyanvihar.com',
  'student4@mygyanvihar.com', 'student5@mygyanvihar.com', 'student6@mygyanvihar.com',
  'student7@mygyanvihar.com',
  'ellwil@mygyanvihar.com',
  'sohit@mygyanvihar.com',
  'naman.raj@mygyanvihar.com', 'rahul.kumar1@mygyanvihar.com', 'priyanka1.gupta@mygyanvihar.com',
  'pooja.varshney@mygyanvihar.com', 'samali.ghosh@mygyanvihar.com', 'neha.ranga@mygyanvihar.com',
  'sumit.23181508@mygyanvihar.com', 'samir.2347454@mygyanvihar.com', 'munmun.2549711@mygyanvihar.com',
  'sakshi.2548515@mygyanvihar.com', 'prasoon.2548543@mygyanvihar.com', 'aniketsain45@gmail.com',
  'hardik.2347602@mygyanvihar.com', 'nasreen.2547973@mygyanvihar.com', 'rahul.2548184@mygyanvihar.com',
  'sameerchoudhary@mygyanvihar.com'
)
OR name ILIKE 'Faculty %'
OR name ILIKE '%Onboarding Demo%'
OR name ILIKE 'HOD Onboarding%';

-- Re-enable CSE demo roster (duplicate mapping deactivated entire CS dept except HR admin).
UPDATE users u
SET is_active = true, updated_at = NOW()
FROM departments d
WHERE u.dept_id = d.dept_id
  AND d.dept_name = 'Computer Science'
  AND u.is_active = false
  AND lower(u.official_email) NOT IN ('hr.admin@mygyanvihar.com');

-- Remove extra Agriculture students added only by duplicate mapping (excluded from team seed).
DELETE FROM student_profiles
WHERE user_id IN (
  SELECT user_id FROM users
  WHERE lower(official_email) IN ('deepak2552709@mygyanvihar.com', 'deepak255092@mygyanvihar.com')
);

DELETE FROM user_roles
WHERE user_id IN (
  SELECT user_id FROM users
  WHERE lower(official_email) IN ('deepak2552709@mygyanvihar.com', 'deepak255092@mygyanvihar.com')
);

DELETE FROM users
WHERE lower(official_email) IN ('deepak2552709@mygyanvihar.com', 'deepak255092@mygyanvihar.com');

DELETE FROM smoke_seed_manifest
WHERE smoke_key = 'schools.hod-faculty-student-mapping';

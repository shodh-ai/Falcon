-- Reset Prasoon & Hardik onboarding; wipe bad enrollments; create Sameer Choudhary.
-- Password for affected users: password123

DELETE FROM student_onboarding_docs
WHERE student_user_id IN (
  SELECT user_id FROM users
  WHERE lower(official_email) IN (
    'prasoon.2548543@mygyanvihar.com',
    'hardik.2347602@mygyanvihar.com'
  )
);

UPDATE users
SET onboarding_status = 'PENDING_PASSWORD_RESET',
    onboarding_profile = '{}'::jsonb,
    password_hash = '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'
WHERE lower(official_email) IN (
  'prasoon.2548543@mygyanvihar.com',
  'hardik.2347602@mygyanvihar.com'
);

DELETE FROM student_course_enrollments
WHERE student_user_id IN (
  SELECT user_id FROM users
  WHERE lower(official_email) IN (
    'prasoon.2548543@mygyanvihar.com',
    'hardik.2347602@mygyanvihar.com'
  )
);

INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, section_code, status)
SELECT t.tenant_id, u.user_id, ac.course_id, 3, 'A', 'ENROLLED'
FROM users u
JOIN academic_courses ac ON ac.course_code = 'CS3001'
CROSS JOIN (SELECT tenant_id FROM tenants WHERE subdomain = 'sgvu' LIMIT 1) t
WHERE lower(u.official_email) IN (
  'prasoon.2548543@mygyanvihar.com',
  'hardik.2347602@mygyanvihar.com'
)
ON CONFLICT (tenant_id, student_user_id, course_id) DO UPDATE SET
  semester = EXCLUDED.semester,
  section_code = EXCLUDED.section_code,
  status = 'ENROLLED';

WITH tenant AS (
  SELECT tenant_id FROM tenants WHERE subdomain = 'sgvu' LIMIT 1
),
dept AS (
  SELECT dept_id FROM departments WHERE dept_name = 'Computer Science' LIMIT 1
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, is_active, onboarding_status, onboarding_profile
)
SELECT
  'f4000010-0000-4000-8000-000000000010'::uuid,
  t.tenant_id,
  'Sameer Choudhary',
  'sameerchoudhary@mygyanvihar.com',
  r.role_id,
  d.dept_id,
  '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO',
  true,
  'PENDING_PASSWORD_RESET',
  '{}'::jsonb
FROM tenant t
CROSS JOIN dept d
JOIN roles r ON r.role_name = 'Student'
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  dept_id = EXCLUDED.dept_id,
  password_hash = EXCLUDED.password_hash,
  is_active = true,
  onboarding_status = 'PENDING_PASSWORD_RESET',
  onboarding_profile = '{}'::jsonb;

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u
WHERE lower(u.official_email) = 'sameerchoudhary@mygyanvihar.com'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

INSERT INTO student_profiles (
  tenant_id, user_id, enrollment_no, enrollment_number, admission_number,
  batch, nationality, admission_status, status
)
SELECT u.tenant_id, u.user_id, 'SAMEER001', 'SAMEER001', 'SAMEER001',
       'BTECH CSE', 'Indian', 'ACTIVE', 'ACTIVE'
FROM users u
WHERE lower(u.official_email) = 'sameerchoudhary@mygyanvihar.com'
ON CONFLICT (user_id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  enrollment_no = EXCLUDED.enrollment_no,
  enrollment_number = EXCLUDED.enrollment_number,
  admission_number = EXCLUDED.admission_number,
  batch = EXCLUDED.batch,
  updated_at = NOW();

INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, section_code, status)
SELECT t.tenant_id, u.user_id, ac.course_id, 3, 'A', 'ENROLLED'
FROM users u
JOIN academic_courses ac ON ac.course_code = 'CS3001'
CROSS JOIN (SELECT tenant_id FROM tenants WHERE subdomain = 'sgvu' LIMIT 1) t
WHERE lower(u.official_email) = 'sameerchoudhary@mygyanvihar.com'
ON CONFLICT (tenant_id, student_user_id, course_id) DO UPDATE SET
  semester = EXCLUDED.semester,
  section_code = EXCLUDED.section_code,
  status = 'ENROLLED';

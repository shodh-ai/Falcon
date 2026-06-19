-- Reset prod student/faculty personas to first-login onboarding wizard.
-- Fixes seed that incorrectly used onboarding_status = 'COMPLETED'.

ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

WITH pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
personas AS (
  SELECT lower(email) AS email, is_student FROM (VALUES
    ('student3@mygyanvihar.com', true),
    ('student4@mygyanvihar.com', true),
    ('student5@mygyanvihar.com', true),
    ('student6@mygyanvihar.com', true),
    ('student7@mygyanvihar.com', true),
    ('faculty2@mygyanvihar.com', false),
    ('faculty3@mygyanvihar.com', false),
    ('faculty4@mygyanvihar.com', false),
    ('faculty5@mygyanvihar.com', false),
    ('faculty6@mygyanvihar.com', false)
  ) AS p(email, is_student)
)
UPDATE users u
SET
  password_hash = pwd.hash,
  onboarding_status = 'PENDING_PASSWORD_RESET',
  onboarding_profile = '{}'::jsonb,
  updated_at = NOW()
FROM pwd, personas p
WHERE lower(u.official_email) = p.email;

-- Clear wizard fields on student profiles (keep enrollment / admission ids from HR seed).
UPDATE student_profiles sp
SET
  gender = NULL,
  date_of_birth = NULL,
  blood_group = NULL,
  phone = NULL,
  batch = NULL,
  parent_info = NULL,
  bank_details = NULL,
  updated_at = NOW()
FROM users u
WHERE sp.user_id = u.user_id
  AND lower(u.official_email) IN (
    'student3@mygyanvihar.com',
    'student4@mygyanvihar.com',
    'student5@mygyanvihar.com',
    'student6@mygyanvihar.com',
    'student7@mygyanvihar.com'
  );

-- Remove any docs uploaded during accidental direct login.
DELETE FROM student_onboarding_docs d
USING users u
WHERE d.student_user_id = u.user_id
  AND lower(u.official_email) IN (
    'student3@mygyanvihar.com',
    'student4@mygyanvihar.com',
    'student5@mygyanvihar.com',
    'student6@mygyanvihar.com',
    'student7@mygyanvihar.com'
  );

DELETE FROM staff_onboarding_docs d
USING users u
WHERE d.staff_user_id = u.user_id
  AND lower(u.official_email) IN (
    'faculty2@mygyanvihar.com',
    'faculty3@mygyanvihar.com',
    'faculty4@mygyanvihar.com',
    'faculty5@mygyanvihar.com',
    'faculty6@mygyanvihar.com'
  );

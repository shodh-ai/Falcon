-- Repair alumni columns if base migration partially applied

ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS batch_year INT;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS current_organization VARCHAR(255);
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS verification_status VARCHAR(50) NOT NULL DEFAULT 'PENDING';
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS higher_education_details JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS opt_in_mentorship BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMPTZ;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS enrollment_number VARCHAR(40);
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS career_update_due_at TIMESTAMPTZ;

UPDATE alumni_profiles SET user_id = student_user_id WHERE user_id IS NULL AND student_user_id IS NOT NULL;
UPDATE alumni_profiles SET current_organization = COALESCE(current_organization, current_company) WHERE current_organization IS NULL;
UPDATE alumni_profiles SET batch_year = COALESCE(batch_year, graduation_year) WHERE batch_year IS NULL;

ALTER TABLE alumni_profiles DROP CONSTRAINT IF EXISTS alumni_profiles_verification_status_check;
ALTER TABLE alumni_profiles ADD CONSTRAINT alumni_profiles_verification_status_check
  CHECK (verification_status IN ('PENDING', 'VERIFIED', 'APPROVED', 'REJECTED'));

WITH tenant AS (SELECT tenant_id FROM tenants WHERE subdomain = 'sgvu' LIMIT 1),
role_row AS (SELECT role_id FROM roles WHERE role_name = 'Alumni' LIMIT 1)
INSERT INTO users (tenant_id, name, official_email, role_id, password_hash, is_active)
SELECT tenant.tenant_id, 'Student One Alumni', 'student1.alumni@example.com', role_row.role_id,
       '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO', true
FROM tenant, role_row
WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(official_email) = 'student1.alumni@example.com');

WITH tenant AS (SELECT tenant_id FROM tenants WHERE subdomain = 'sgvu' LIMIT 1),
alumni_user AS (
  SELECT user_id, name, official_email FROM users
  WHERE lower(official_email) = 'student1.alumni@example.com' LIMIT 1
)
INSERT INTO alumni_profiles (
  tenant_id, alumni_id, student_user_id, user_id, name, email,
  batch_year, graduation_year, current_organization, designation,
  linkedin_url, verification_status, opt_in_mentorship, profile_updated_at
)
SELECT tenant.tenant_id, gen_random_uuid(), alumni_user.user_id, alumni_user.user_id,
       alumni_user.name, alumni_user.official_email, 2026, 2026,
       'Falcon Labs', 'Software Engineer', 'https://linkedin.com/in/student-one',
       'VERIFIED', true, NOW()
FROM tenant, alumni_user
WHERE NOT EXISTS (
  SELECT 1 FROM alumni_profiles p WHERE p.student_user_id = alumni_user.user_id
);

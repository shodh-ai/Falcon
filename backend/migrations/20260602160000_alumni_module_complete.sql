-- Alumni Management Module: profile fields, donations ledger, events, conversion support

ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(user_id) ON DELETE SET NULL;
UPDATE alumni_profiles SET user_id = student_user_id WHERE user_id IS NULL AND student_user_id IS NOT NULL;

ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS higher_education_details JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS opt_in_mentorship BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMPTZ;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS enrollment_number VARCHAR(40);
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS career_update_due_at TIMESTAMPTZ;

UPDATE alumni_profiles
SET current_organization = COALESCE(current_organization, current_company)
WHERE current_organization IS NULL AND current_company IS NOT NULL;

UPDATE alumni_profiles
SET batch_year = COALESCE(batch_year, graduation_year)
WHERE batch_year IS NULL AND graduation_year IS NOT NULL;

ALTER TABLE alumni_profiles DROP CONSTRAINT IF EXISTS alumni_profiles_verification_status_check;
ALTER TABLE alumni_profiles ADD CONSTRAINT alumni_profiles_verification_status_check
  CHECK (verification_status IN ('PENDING', 'VERIFIED', 'APPROVED', 'REJECTED'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_alumni_profiles_user_tenant
  ON alumni_profiles(tenant_id, student_user_id)
  WHERE student_user_id IS NOT NULL;

ALTER TABLE alumni_donations ADD COLUMN IF NOT EXISTS alumni_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE alumni_donations ADD COLUMN IF NOT EXISTS purpose VARCHAR(255);
ALTER TABLE alumni_donations ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(255);
ALTER TABLE alumni_donations ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) NOT NULL DEFAULT 'PENDING';
ALTER TABLE alumni_donations ADD COLUMN IF NOT EXISTS donated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE alumni_donations ADD COLUMN IF NOT EXISTS ledger_account VARCHAR(80) NOT NULL DEFAULT 'ENDOWMENT';
ALTER TABLE alumni_donations ADD COLUMN IF NOT EXISTS tax_receipt_number VARCHAR(80);

UPDATE alumni_donations d
SET alumni_user_id = p.student_user_id
FROM alumni_profiles p
WHERE d.alumni_user_id IS NULL AND d.alumni_id = p.alumni_id AND p.student_user_id IS NOT NULL;

UPDATE alumni_donations
SET payment_status = CASE
  WHEN status IN ('SUCCESS', 'PAID', 'COMPLETED') THEN 'SUCCESS'
  WHEN status IN ('FAILED', 'CANCELLED') THEN 'FAILED'
  ELSE 'PENDING'
END
WHERE payment_status = 'PENDING';

UPDATE alumni_donations
SET transaction_id = gateway_reference
WHERE transaction_id IS NULL AND gateway_reference IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_alumni_donations_transaction_id
  ON alumni_donations(tenant_id, transaction_id)
  WHERE transaction_id IS NOT NULL;

ALTER TABLE alumni_events ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE alumni_events ALTER COLUMN event_date TYPE TIMESTAMPTZ USING event_date::timestamptz;

-- Demo alumni persona (password123) for QA
WITH tenant AS (SELECT tenant_id FROM tenants WHERE subdomain = 'sgvu' LIMIT 1),
role_row AS (SELECT role_id FROM roles WHERE role_name = 'Alumni' LIMIT 1),
student AS (
  SELECT u.user_id, u.name, u.official_email, sp.enrollment_number, sp.graduation_year
  FROM users u
  LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
  WHERE lower(u.official_email) = 'student1.alumni@example.com'
  LIMIT 1
)
INSERT INTO users (tenant_id, name, official_email, role_id, password_hash, is_active)
SELECT tenant.tenant_id, 'Student One Alumni', 'student1.alumni@example.com', role_row.role_id,
       '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO', true
FROM tenant, role_row
WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(official_email) = 'student1.alumni@example.com')
ON CONFLICT DO NOTHING;

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

INSERT INTO alumni_events (tenant_id, title, event_date, venue, description, is_published)
SELECT t.tenant_id, 'SGVU Global Alumni Meet 2026', NOW() + INTERVAL '45 days',
       'Main Auditorium, Campus A', 'Annual networking dinner and keynote by industry leaders.', true
FROM tenants t WHERE t.subdomain = 'sgvu'
  AND NOT EXISTS (
    SELECT 1 FROM alumni_events e WHERE e.tenant_id = t.tenant_id AND e.title = 'SGVU Global Alumni Meet 2026'
  );

-- Student first-login onboarding: status machine, document vault, pilot seed

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_onboarding_status;

ALTER TABLE users
  ADD CONSTRAINT chk_users_onboarding_status
  CHECK (onboarding_status IN (
    'PENDING_ONBOARDING',
    'IN_PROGRESS',
    'ACTIVE',
    'EXITED',
    'PENDING_PASSWORD_RESET',
    'PENDING_DOCUMENTS',
    'PENDING_ADMIN_APPROVAL',
    'COMPLETED'
  ));

CREATE TABLE IF NOT EXISTS student_onboarding_docs (
  doc_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  doc_type VARCHAR(50) NOT NULL CHECK (doc_type IN ('AADHAAR', '10TH_MARKSHEET', '12TH_MARKSHEET', 'PHOTO')),
  file_path TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  admin_remarks TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_user_id, doc_type)
);

CREATE INDEX IF NOT EXISTS idx_student_onboarding_docs_student
  ON student_onboarding_docs (student_user_id, status);

CREATE INDEX IF NOT EXISTS idx_users_onboarding_status
  ON users (tenant_id, onboarding_status)
  WHERE onboarding_status IN ('PENDING_ADMIN_APPROVAL', 'PENDING_DOCUMENTS', 'PENDING_PASSWORD_RESET');

-- 10 pilot students (default password: password123)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE role_name = 'Student') THEN
    INSERT INTO roles (role_name, description)
    VALUES ('Student', 'Application role for Student portal access');
  END IF;
END $$;

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
dept AS (
  SELECT dept_id FROM departments WHERE dept_name = 'Computer Science' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
pilot AS (
  SELECT * FROM (VALUES
    ('c1000001-0000-4000-8000-000000000001'::uuid, 'Pilot Student 1',  'pilot1@mygyanvihar.com'),
    ('c1000002-0000-4000-8000-000000000002'::uuid, 'Pilot Student 2',  'pilot2@mygyanvihar.com'),
    ('c1000003-0000-4000-8000-000000000003'::uuid, 'Pilot Student 3',  'pilot3@mygyanvihar.com'),
    ('c1000004-0000-4000-8000-000000000004'::uuid, 'Pilot Student 4',  'pilot4@mygyanvihar.com'),
    ('c1000005-0000-4000-8000-000000000005'::uuid, 'Pilot Student 5',  'pilot5@mygyanvihar.com'),
    ('c1000006-0000-4000-8000-000000000006'::uuid, 'Pilot Student 6',  'pilot6@mygyanvihar.com'),
    ('c1000007-0000-4000-8000-000000000007'::uuid, 'Pilot Student 7',  'pilot7@mygyanvihar.com'),
    ('c1000008-0000-4000-8000-000000000008'::uuid, 'Pilot Student 8',  'pilot8@mygyanvihar.com'),
    ('c1000009-0000-4000-8000-000000000009'::uuid, 'Pilot Student 9',  'pilot9@mygyanvihar.com'),
    ('c100000a-0000-4000-8000-00000000000a'::uuid, 'Pilot Student 10', 'pilot10@mygyanvihar.com')
  ) AS p(user_id, name, email)
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, is_active, onboarding_status
)
SELECT
  p.user_id,
  t.tenant_id,
  p.name,
  p.email,
  r.role_id,
  d.dept_id,
  pwd.hash,
  true,
  'PENDING_PASSWORD_RESET'
FROM pilot p
CROSS JOIN tenant t
CROSS JOIN pwd
JOIN roles r ON r.role_name = 'Student'
LEFT JOIN dept d ON true
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  password_hash = EXCLUDED.password_hash,
  onboarding_status = 'PENDING_PASSWORD_RESET',
  is_active = true;

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u
WHERE u.official_email LIKE 'pilot%@mygyanvihar.com'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

INSERT INTO student_profiles (tenant_id, user_id, status)
SELECT u.tenant_id, u.user_id, 'ACTIVE'
FROM users u
WHERE u.official_email LIKE 'pilot%@mygyanvihar.com'
ON CONFLICT (user_id) DO NOTHING;

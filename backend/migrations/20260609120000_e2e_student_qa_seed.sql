-- E2E Student QA personas (password: password123)
-- Fixes common manual-seed mistakes:
--   • academic_mentorships has no "status" column (use is_active default)
--   • fee table is finance_fee_demands (not fin_fee_demands)
--   • falcon_notifications requires tenant_id (multi-tenant)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE role_name = 'Student') THEN
    INSERT INTO roles (role_name, description)
    VALUES ('Student', 'Application role for Student portal access');
  END IF;
END $$;

INSERT INTO departments (dept_name, description)
VALUES ('Computer Science', 'School of Computing & IT')
ON CONFLICT (dept_name) DO NOTHING;

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
dept AS (
  SELECT dept_id FROM departments WHERE dept_name = 'Computer Science' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
seed_students AS (
  SELECT * FROM (VALUES
    ('e2e00001-0000-4000-8000-000000000001'::uuid, 'E2E Student One',   'e2e.student1@mygyanvihar.com'),
    ('e2e00002-0000-4000-8000-000000000002'::uuid, 'E2E Student Two',   'e2e.student2@mygyanvihar.com'),
    ('e2e00003-0000-4000-8000-000000000003'::uuid, 'E2E Student Three', 'e2e.student3@mygyanvihar.com'),
    ('e2e00004-0000-4000-8000-000000000004'::uuid, 'E2E Student Four',  'e2e.student4@mygyanvihar.com'),
    ('e2e00005-0000-4000-8000-000000000005'::uuid, 'E2E Student Five',  'e2e.student5@mygyanvihar.com')
  ) AS s(user_id, name, email)
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, is_active
)
SELECT
  ss.user_id,
  t.tenant_id,
  ss.name,
  ss.email,
  r.role_id,
  d.dept_id,
  p.hash,
  true
FROM seed_students ss
CROSS JOIN tenant t
CROSS JOIN pwd p
CROSS JOIN dept d
JOIN roles r ON r.role_name = 'Student'
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  dept_id = EXCLUDED.dept_id,
  password_hash = EXCLUDED.password_hash,
  is_active = true;

-- Minimal student_profiles so portal pages load
INSERT INTO student_profiles (user_id, tenant_id, nationality, admission_status)
SELECT u.user_id, u.tenant_id, 'Indian', 'ACTIVE'
FROM users u
WHERE u.official_email LIKE 'e2e.student%@mygyanvihar.com'
ON CONFLICT (user_id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  admission_status = 'ACTIVE';

-- Mentorship: all E2E students → faculty1 (no status column on academic_mentorships)
INSERT INTO academic_mentorships (student_user_id, proctor_user_id, is_active)
SELECT
  u.user_id,
  (SELECT user_id FROM users WHERE official_email = 'faculty1@mygyanvihar.com' LIMIT 1),
  true
FROM users u
WHERE u.official_email LIKE 'e2e.student%@mygyanvihar.com'
ON CONFLICT (student_user_id) DO UPDATE SET
  proctor_user_id = EXCLUDED.proctor_user_id,
  is_active = true;

-- Welcome notifications (tenant_id required)
INSERT INTO falcon_notifications (tenant_id, user_id, category, title, message, action_link)
SELECT
  u.tenant_id,
  u.user_id,
  'ACADEMICS',
  'Welcome to Falcon OS',
  'Please complete your profile and upload your documents.',
  '/student/profile'
FROM users u
WHERE u.official_email LIKE 'e2e.student%@mygyanvihar.com'
  AND NOT EXISTS (
    SELECT 1 FROM falcon_notifications n
    WHERE n.user_id = u.user_id AND n.title = 'Welcome to Falcon OS'
  );

-- Pending tuition demand for admit-card / finance E2E (only if finance migration applied)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'finance_fee_demands'
  ) THEN
    INSERT INTO finance_fee_demands (
      tenant_id, student_user_id, fee_head, academic_year, semester,
      total_amount, paid_amount, due_date, status
    )
    SELECT
      u.tenant_id,
      u.user_id,
      'TUITION',
      '2025-26',
      5,
      85000.00,
      0.00,
      CURRENT_DATE + 30,
      'PENDING'
    FROM users u
    WHERE u.official_email LIKE 'e2e.student%@mygyanvihar.com'
      AND NOT EXISTS (
        SELECT 1 FROM finance_fee_demands d
        WHERE d.student_user_id = u.user_id AND d.fee_head = 'TUITION' AND d.academic_year = '2025-26'
      );
  END IF;
END $$;

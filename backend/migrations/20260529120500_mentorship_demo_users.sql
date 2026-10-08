-- Mentorship Demo Setup Script
-- This script ensures the demo users exist and are properly linked

-- 1. Ensure the Faculty account exists
INSERT INTO users (user_id, name, official_email, role_id, is_active, tenant_id)
VALUES (
  gen_random_uuid(), 'Ellwil Teacher', 'ellwil@mygyanvihar.com', 
  (SELECT role_id FROM roles WHERE role_name = 'Faculty' LIMIT 1), true,
  'a0000000-0000-4000-8000-000000000001'
)
ON CONFLICT (official_email) 
DO UPDATE SET
  role_id = (SELECT role_id FROM roles WHERE role_name = 'Faculty' LIMIT 1),
  tenant_id = COALESCE(users.tenant_id, EXCLUDED.tenant_id);

-- 2. Ensure the Student account exists
INSERT INTO users (user_id, name, official_email, role_id, is_active, tenant_id)
VALUES (
  gen_random_uuid(), 'Sachin Y', 'y.sachin@mygyanvihar.com', 
  (SELECT role_id FROM roles WHERE role_name = 'Student' LIMIT 1), true,
  'a0000000-0000-4000-8000-000000000001'
)
ON CONFLICT (official_email) 
DO UPDATE SET
  role_id = (SELECT role_id FROM roles WHERE role_name = 'Student' LIMIT 1),
  tenant_id = COALESCE(users.tenant_id, EXCLUDED.tenant_id);

-- 3. Link them in the Mentorship table
INSERT INTO academic_mentorships (student_user_id, proctor_user_id, is_active)
VALUES (
  (SELECT user_id FROM users WHERE official_email = 'y.sachin@mygyanvihar.com'),
  (SELECT user_id FROM users WHERE official_email = 'ellwil@mygyanvihar.com'),
  true
) 
-- If Sachin already has a mentor, update it to Ellwil
ON CONFLICT (student_user_id) 
DO UPDATE SET proctor_user_id = (SELECT user_id FROM users WHERE official_email = 'ellwil@mygyanvihar.com'), is_active = true;

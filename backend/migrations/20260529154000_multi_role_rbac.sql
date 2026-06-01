-- Multi-role RBAC foundation.
-- users.role_id remains as compatibility primary-role storage while user_roles
-- becomes the source of truth for role membership.

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  role_id INT REFERENCES roles(role_id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_primary ON user_roles(user_id, is_primary);

-- Backfill every existing single role into the mapping table.
INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT user_id, role_id, true
FROM users
WHERE role_id IS NOT NULL
ON CONFLICT (user_id, role_id) DO UPDATE SET
  is_primary = user_roles.is_primary OR EXCLUDED.is_primary;

-- Ensure each user has exactly one primary mapped role. If legacy role_id is
-- missing or not primary, pick their earliest mapped role deterministically.
WITH ranked_roles AS (
  SELECT
    user_id,
    role_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY is_primary DESC, role_id ASC
    ) AS rn
  FROM user_roles
)
UPDATE user_roles ur
SET is_primary = ranked_roles.rn = 1
FROM ranked_roles
WHERE ur.user_id = ranked_roles.user_id
  AND ur.role_id = ranked_roles.role_id;

-- Scoped responsibilities.
ALTER TABLE departments ADD COLUMN IF NOT EXISTS hod_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE operations_hostel_rooms ADD COLUMN IF NOT EXISTS warden_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL;

-- Demo multi-hat users:
-- HOD inherits faculty workspace; Warden can also hold faculty responsibilities
-- without making the hostel sidebar noisy by default.
WITH role_ids AS (
  SELECT
    (SELECT role_id FROM roles WHERE role_name = 'Faculty' LIMIT 1) AS faculty_role_id,
    (SELECT role_id FROM roles WHERE role_name = 'HOD' LIMIT 1) AS hod_role_id,
    (SELECT role_id FROM roles WHERE role_name = 'Warden' LIMIT 1) AS warden_role_id
),
users_ctx AS (
  SELECT
    (SELECT user_id FROM users WHERE lower(official_email) = 'hod@mygyanvihar.com' LIMIT 1) AS hod_id,
    (SELECT user_id FROM users WHERE lower(official_email) = 'warden@mygyanvihar.com' LIMIT 1) AS warden_id
)
INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT users_ctx.hod_id, role_ids.faculty_role_id, false
FROM users_ctx, role_ids
WHERE users_ctx.hod_id IS NOT NULL AND role_ids.faculty_role_id IS NOT NULL
UNION ALL
SELECT users_ctx.warden_id, role_ids.faculty_role_id, false
FROM users_ctx, role_ids
WHERE users_ctx.warden_id IS NOT NULL AND role_ids.faculty_role_id IS NOT NULL
ON CONFLICT (user_id, role_id) DO UPDATE SET
  is_primary = user_roles.is_primary OR EXCLUDED.is_primary;

-- Keep explicit primary hats for HOD and Warden demo accounts.
UPDATE user_roles
SET is_primary = false
WHERE user_id IN (
  SELECT user_id FROM users
  WHERE lower(official_email) IN ('hod@mygyanvihar.com', 'warden@mygyanvihar.com')
);

UPDATE user_roles ur
SET is_primary = true
FROM users u, roles r
WHERE ur.user_id = u.user_id
  AND ur.role_id = r.role_id
  AND (
    (lower(u.official_email) = 'hod@mygyanvihar.com' AND r.role_name = 'HOD')
    OR (lower(u.official_email) = 'warden@mygyanvihar.com' AND r.role_name = 'Warden')
  );

-- Department and hostel scoping.
UPDATE departments
SET hod_user_id = (SELECT user_id FROM users WHERE lower(official_email) = 'hod@mygyanvihar.com' LIMIT 1)
WHERE dept_name = 'Computer Science'
  AND (hod_user_id IS NULL OR hod_user_id = (SELECT user_id FROM users WHERE lower(official_email) = 'hod@mygyanvihar.com' LIMIT 1));

UPDATE users
SET dept_id = (SELECT dept_id FROM departments WHERE dept_name = 'Computer Science' LIMIT 1)
WHERE lower(official_email) IN ('faculty1@mygyanvihar.com', 'hod@mygyanvihar.com')
  AND (dept_id IS NULL OR dept_id = (SELECT dept_id FROM departments WHERE dept_name = 'Computer Science' LIMIT 1));

UPDATE operations_hostel_rooms
SET warden_user_id = (SELECT user_id FROM users WHERE lower(official_email) = 'warden@mygyanvihar.com' LIMIT 1)
WHERE warden_user_id IS NULL;

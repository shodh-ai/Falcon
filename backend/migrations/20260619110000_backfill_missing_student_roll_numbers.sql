-- Backfill displayable roll/enrollment numbers for existing student profiles.
-- Faculty marks entry hides UUID fallbacks, so blank student identifiers show as "—".

ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS enrollment_number VARCHAR(40);
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS admission_number VARCHAR(80);

WITH enrolled_students_without_profiles_base AS (
  SELECT DISTINCT
    u.user_id,
    u.tenant_id
  FROM users u
  INNER JOIN roles r ON r.role_id = u.role_id
  INNER JOIN student_course_enrollments e
    ON e.student_user_id = u.user_id
   AND e.tenant_id = u.tenant_id
  LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
  WHERE lower(r.role_name) = 'student'
    AND sp.student_profile_id IS NULL
),
enrolled_students_without_profiles AS (
  SELECT
    user_id,
    tenant_id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id
      ORDER BY user_id
    ) AS rn
  FROM enrolled_students_without_profiles_base
)
INSERT INTO student_profiles (tenant_id, user_id, enrollment_no, status)
SELECT
  tenant_id,
  user_id,
  'SGVU-2026-' || LPAD((1000 + rn)::text, 4, '0'),
  'ACTIVE'
FROM enrolled_students_without_profiles
ON CONFLICT (user_id) DO UPDATE
SET tenant_id = COALESCE(student_profiles.tenant_id, EXCLUDED.tenant_id),
    enrollment_no = COALESCE(NULLIF(BTRIM(student_profiles.enrollment_no), ''), EXCLUDED.enrollment_no),
    status = COALESCE(student_profiles.status, 'ACTIVE'),
    updated_at = NOW();

WITH missing_rolls AS (
  SELECT
    sp.student_profile_id,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(sp.tenant_id, u.tenant_id)
      ORDER BY u.created_at NULLS LAST, u.name, u.user_id
    ) AS rn
  FROM student_profiles sp
  INNER JOIN users u ON u.user_id = sp.user_id
  LEFT JOIN roles r ON r.role_id = u.role_id
  WHERE lower(COALESCE(r.role_name, '')) = 'student'
    AND NULLIF(BTRIM(COALESCE(sp.enrollment_no, '')), '') IS NULL
    AND NULLIF(BTRIM(COALESCE(sp.enrollment_number, '')), '') IS NULL
    AND NULLIF(BTRIM(COALESCE(sp.admission_number, '')), '') IS NULL
)
UPDATE student_profiles sp
SET enrollment_no = 'SGVU-2026-' || LPAD(m.rn::text, 4, '0'),
    updated_at = NOW()
FROM missing_rolls m
WHERE sp.student_profile_id = m.student_profile_id;

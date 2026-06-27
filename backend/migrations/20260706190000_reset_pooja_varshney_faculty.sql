-- Reset Pooja Varshney faculty persona: delete any existing row and recreate with canonical UUID.
-- Password: password123

DO $$
DECLARE
  v_old UUID;
  r RECORD;
BEGIN
  SELECT user_id
    INTO v_old
    FROM users
   WHERE lower(official_email) = 'pooja.varshney@mygyanvihar.com';

  IF v_old IS NULL THEN
    RETURN;
  END IF;

  -- proctor_user_id is RESTRICT — clear mentorship rows before deleting the user.
  DELETE FROM academic_mentorships WHERE proctor_user_id = v_old;

  FOR r IN
    SELECT tc.table_schema, tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name
       AND rc.constraint_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = 'public'
       AND ccu.table_name = 'users'
       AND ccu.column_name = 'user_id'
       AND rc.delete_rule IN ('NO ACTION', 'RESTRICT')
  LOOP
    EXECUTE format(
      'UPDATE %I.%I SET %I = NULL WHERE %I = $1',
      r.table_schema,
      r.table_name,
      r.column_name,
      r.column_name
    ) USING v_old;
  END LOOP;

  DELETE FROM users WHERE user_id = v_old;
END $$;

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
dept AS (
  SELECT dept_id FROM departments WHERE dept_name = 'Computer Science' LIMIT 1
),
hod AS (
  SELECT user_id FROM users WHERE official_email = 'hod@mygyanvihar.com' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, reporting_officer_id, is_active, onboarding_status, onboarding_profile
)
SELECT
  'f3000004-0000-4000-8000-000000000004'::uuid,
  t.tenant_id,
  'Pooja Varshney',
  'pooja.varshney@mygyanvihar.com',
  r.role_id,
  d.dept_id,
  p.hash,
  hod.user_id,
  true,
  'ACTIVE',
  '{}'::jsonb
FROM tenant t
CROSS JOIN pwd p
CROSS JOIN dept d
LEFT JOIN hod ON true
JOIN roles r ON r.role_name = 'Faculty';

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u
WHERE lower(u.official_email) = 'pooja.varshney@mygyanvihar.com'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

UPDATE users
   SET onboarding_status = 'ACTIVE',
       onboarding_profile = '{}'::jsonb,
       password_hash = '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'
 WHERE lower(official_email) = 'pooja.varshney@mygyanvihar.com';

UPDATE academic_course_allocations a
   SET faculty_user_id = u.user_id,
       status = 'ACTIVE',
       updated_at = NOW()
  FROM users u,
       academic_subjects s,
       (VALUES
         ('CS3001', 'BTECH CSE', 'III-B'),
         ('CS3052', 'BTECH CSE', 'III-B'),
         ('CP407',  'BTECH CSE', 'VII-A'),
         ('PC401',  'BTECH CSE', 'VII-B'),
         ('CP407',  'BTECH CSE', 'VII-B')
       ) AS slots(subject_code, program_name, semester)
 WHERE lower(u.official_email) = 'pooja.varshney@mygyanvihar.com'
   AND a.tenant_id = u.tenant_id
   AND a.academic_year = '2026-2027'
   AND a.subject_id = s.subject_id
   AND s.subject_code = slots.subject_code
   AND a.program_name = slots.program_name
   AND a.semester = slots.semester;

UPDATE academic_timetables t
   SET faculty_user_id = u.user_id
  FROM users u,
       academic_course_allocations a
 WHERE lower(u.official_email) = 'pooja.varshney@mygyanvihar.com'
   AND a.faculty_user_id = u.user_id
   AND a.academic_year = '2026-2027'
   AND t.tenant_id = u.tenant_id
   AND t.course_id = a.course_id
   AND t.deleted_at IS NULL;

-- Auto-assign mentors from semester-section anchor subjects (sem 3 CS3001, etc.).
WITH student_slots AS (
  SELECT
    u.user_id AS student_user_id,
    sp.tenant_id,
    sp.current_semester,
    sp.section_code,
    COALESCE(sp.batch, 'BTECH CSE') AS program
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  WHERE sp.current_semester IS NOT NULL
    AND sp.section_code IS NOT NULL
),
anchor_codes AS (
  SELECT * FROM (VALUES
    (3, 'CS3001'),
    (5, 'CP301'),
    (7, 'CP405')
  ) AS v(semester_num, subject_code)
),
anchor_mentors AS (
  SELECT DISTINCT ON (ss.student_user_id)
    ss.student_user_id,
    a.faculty_user_id AS proctor_user_id
  FROM student_slots ss
  JOIN anchor_codes ac ON ac.semester_num = ss.current_semester
  JOIN academic_subjects s ON s.subject_code = ac.subject_code
  JOIN academic_course_allocations a
    ON a.tenant_id = ss.tenant_id
   AND a.subject_id = s.subject_id
   AND a.academic_year = '2026-2027'
   AND a.status = 'ACTIVE'
   AND a.faculty_user_id IS NOT NULL
   AND upper(replace(COALESCE(a.program_name, ''), ' ', '')) = upper(replace(ss.program, ' ', ''))
   AND CASE upper(split_part(COALESCE(a.semester, ''), '-', 1))
     WHEN 'I' THEN 1 WHEN 'II' THEN 2 WHEN 'III' THEN 3 WHEN 'IV' THEN 4
     WHEN 'V' THEN 5 WHEN 'VI' THEN 6 WHEN 'VII' THEN 7 WHEN 'VIII' THEN 8
     ELSE NULL END = ss.current_semester
   AND upper(split_part(a.semester, '-', 2)) = upper(ss.section_code)
  ORDER BY ss.student_user_id, a.updated_at DESC
),
load_mentors AS (
  SELECT DISTINCT ON (ss.student_user_id)
    ss.student_user_id,
    a.faculty_user_id AS proctor_user_id
  FROM student_slots ss
  JOIN academic_course_allocations a ON a.tenant_id = ss.tenant_id
  JOIN academic_subjects s ON s.subject_id = a.subject_id
  WHERE a.academic_year = '2026-2027'
    AND a.status = 'ACTIVE'
    AND a.faculty_user_id IS NOT NULL
    AND upper(replace(COALESCE(a.program_name, ''), ' ', '')) = upper(replace(ss.program, ' ', ''))
    AND CASE upper(split_part(COALESCE(a.semester, ''), '-', 1))
      WHEN 'I' THEN 1 WHEN 'II' THEN 2 WHEN 'III' THEN 3 WHEN 'IV' THEN 4
      WHEN 'V' THEN 5 WHEN 'VI' THEN 6 WHEN 'VII' THEN 7 WHEN 'VIII' THEN 8
      ELSE NULL END = ss.current_semester
    AND upper(split_part(a.semester, '-', 2)) = upper(ss.section_code)
    AND COALESCE(s.subject_type, 'THEORY') IN ('THEORY', 'SKILL')
    AND s.subject_code NOT LIKE 'OE%'
  GROUP BY ss.student_user_id, a.faculty_user_id
  ORDER BY ss.student_user_id, COUNT(*) DESC, a.faculty_user_id
),
resolved AS (
  SELECT
    ss.student_user_id,
    COALESCE(am.proctor_user_id, lm.proctor_user_id) AS proctor_user_id
  FROM student_slots ss
  LEFT JOIN anchor_mentors am ON am.student_user_id = ss.student_user_id
  LEFT JOIN load_mentors lm ON lm.student_user_id = ss.student_user_id
  WHERE COALESCE(am.proctor_user_id, lm.proctor_user_id) IS NOT NULL
)
INSERT INTO academic_mentorships (student_user_id, proctor_user_id, is_active)
SELECT student_user_id, proctor_user_id, true
FROM resolved
ON CONFLICT (student_user_id) DO UPDATE SET
  proctor_user_id = EXCLUDED.proctor_user_id,
  is_active = true,
  updated_at = NOW(),
  deleted_at = NULL;

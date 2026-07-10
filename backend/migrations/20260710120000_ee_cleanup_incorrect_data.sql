-- Remove incorrect / mock Electrical Engineering data before EE re-seed.
-- Targets: old seed_ece_ee.js personas, duplicate dept, stale B.Tech EE academic rows.

-- Reset HOD on Electrical Engg
UPDATE departments
SET hod_user_id = NULL, updated_at = NOW()
WHERE dept_name = 'Electrical Engg';

-- Purge B.Tech EE academic rows (allocations, timetables, enrollments)
DELETE FROM student_course_enrollments e
USING academic_courses c
WHERE e.course_id = c.course_id
  AND c.course_code LIKE 'EE%';

DELETE FROM academic_timetables t
USING academic_courses c
WHERE t.course_id = c.course_id
  AND c.course_code LIKE 'EE%';

DELETE FROM academic_course_allocations a
WHERE upper(replace(COALESCE(a.program_name, ''), ' ', '')) IN ('B.TECHEE', 'BTECHEE')
   OR a.program_name ILIKE '%B.Tech%EE%';

-- Remove mentorships for EE dept students (re-seeded later)
DELETE FROM academic_mentorships m
USING users u
JOIN departments d ON d.dept_id = u.dept_id
WHERE m.student_user_id = u.user_id
  AND d.dept_name = 'Electrical Engg';

-- Mock users from seed_ece_ee.js
DELETE FROM academic_mentorships m
USING users u
WHERE m.student_user_id = u.user_id
  AND lower(u.official_email) IN ('charlie.ee@mygyanvihar.com', 'dave.ee@mygyanvihar.com');

DELETE FROM academic_mentorships m
USING users u
WHERE m.proctor_user_id = u.user_id
  AND lower(u.official_email) IN ('charlie.ee@mygyanvihar.com', 'dave.ee@mygyanvihar.com');

DELETE FROM student_course_enrollments e
USING users u
WHERE e.student_user_id = u.user_id
  AND lower(u.official_email) IN ('charlie.ee@mygyanvihar.com', 'dave.ee@mygyanvihar.com');

DELETE FROM user_roles ur
USING users u
WHERE ur.user_id = u.user_id
  AND lower(u.official_email) IN ('charlie.ee@mygyanvihar.com', 'dave.ee@mygyanvihar.com');

DELETE FROM student_profiles sp
USING users u
WHERE sp.user_id = u.user_id
  AND lower(u.official_email) IN ('charlie.ee@mygyanvihar.com', 'dave.ee@mygyanvihar.com');

DELETE FROM users u
WHERE lower(u.official_email) IN ('charlie.ee@mygyanvihar.com', 'dave.ee@mygyanvihar.com');

-- Duplicate department from old script (keep canonical Electrical Engg)
DO $$
DECLARE
  dup_id INTEGER;
  canon_id INTEGER;
BEGIN
  SELECT dept_id INTO canon_id FROM departments WHERE dept_name = 'Electrical Engg' LIMIT 1;
  SELECT dept_id INTO dup_id FROM departments WHERE dept_name = 'Electrical Engineering' LIMIT 1;
  IF dup_id IS NOT NULL AND canon_id IS NOT NULL AND dup_id <> canon_id THEN
    UPDATE users SET dept_id = canon_id WHERE dept_id = dup_id;
    UPDATE iam_programs SET dept_id = canon_id WHERE dept_id = dup_id;
    UPDATE departments SET hod_user_id = NULL WHERE dept_id = dup_id;
    DELETE FROM departments WHERE dept_id = dup_id;
  ELSIF dup_id IS NOT NULL AND canon_id IS NULL THEN
    UPDATE departments SET dept_name = 'Electrical Engg' WHERE dept_id = dup_id;
  END IF;
END $$;

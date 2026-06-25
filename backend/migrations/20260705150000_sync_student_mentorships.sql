-- Assign mentors (proctors) to students based on semester-section workload.
-- Anchor subjects: sem 3 -> CS3001, sem 5 -> CP301, sem 7 -> CP405.
-- Falls back to faculty with the highest theory/skill load in the same section.

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

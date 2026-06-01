-- Sample published component marks for Sachin (VTOP-style continuous assessment QA)

ALTER TABLE academic_marks DROP CONSTRAINT IF EXISTS academic_marks_exam_type_check;
ALTER TABLE academic_marks ADD CONSTRAINT academic_marks_exam_type_check
  CHECK (exam_type IN ('CAT1', 'CAT2', 'QUIZ', 'END_TERM', 'INTERNAL', 'ASSIGNMENT', 'DA1', 'DA2'));

WITH ctx AS (
  SELECT
    u.user_id AS student_id,
    t.tenant_id
  FROM users u
  CROSS JOIN tenants t
  WHERE lower(u.official_email) = 'y.sachin@mygyanvihar.com'
    AND t.subdomain = 'sgvu'
  LIMIT 1
),
courses AS (
  SELECT c.course_id, c.course_code, e.semester
  FROM student_course_enrollments e
  JOIN academic_courses c ON c.course_id = e.course_id
  JOIN ctx ON ctx.student_id = e.student_user_id
  WHERE e.semester IN (1, 2)
)
INSERT INTO academic_marks (tenant_id, student_user_id, course_id, exam_type, marks_obtained, max_marks, status, published_at)
SELECT ctx.tenant_id, ctx.student_id, c.course_id, m.exam_type, m.obtained, m.max_m, 'PUBLISHED', NOW()
FROM ctx
CROSS JOIN courses c
CROSS JOIN LATERAL (
  VALUES
    ('DA1', 18, 20),
    ('DA2', 15, 20),
    ('CAT1', 42, 50),
    ('CAT2', 38, 50)
) AS m(exam_type, obtained, max_m)
WHERE c.course_code IN ('CSE101', 'CSE102', 'CSE103')
ON CONFLICT (tenant_id, student_user_id, course_id, exam_type) DO UPDATE SET
  marks_obtained = EXCLUDED.marks_obtained,
  max_marks = EXCLUDED.max_marks,
  status = 'PUBLISHED',
  published_at = NOW();

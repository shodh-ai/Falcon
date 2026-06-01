-- Digital Assignments (DA) and coursework workflow.

CREATE TABLE IF NOT EXISTS academic_assignments (
  assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  course_id UUID REFERENCES academic_courses(course_id) ON DELETE CASCADE,
  faculty_user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  reference_file_path TEXT,
  reference_file_key TEXT,
  max_marks INT NOT NULL,
  due_date TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  submission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  assignment_id UUID REFERENCES academic_assignments(assignment_id) ON DELETE CASCADE,
  student_user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_key TEXT,
  submitted_at TIMESTAMP DEFAULT NOW(),
  marks_awarded DECIMAL(5,2),
  faculty_remarks TEXT,
  UNIQUE (tenant_id, assignment_id, student_user_id)
);

CREATE INDEX IF NOT EXISTS idx_academic_assignments_course_due
  ON academic_assignments(tenant_id, course_id, due_date);

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student
  ON assignment_submissions(tenant_id, student_user_id);

-- Ensure faculty1 teaches at least one course for DA QA.
WITH ctx AS (
  SELECT
    (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1) AS tenant_id,
    (SELECT user_id FROM users WHERE lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1) AS faculty_id
),
course_upsert AS (
  INSERT INTO academic_courses (tenant_id, course_code, course_name, credits, is_elective)
  SELECT ctx.tenant_id, 'DA101', 'Digital Assignment Studio', 4, false
  FROM ctx
  WHERE ctx.tenant_id IS NOT NULL
  ON CONFLICT (tenant_id, course_code) DO UPDATE SET
    course_name = EXCLUDED.course_name,
    credits = EXCLUDED.credits
  RETURNING tenant_id, course_id
)
INSERT INTO academic_timetables (tenant_id, course_id, faculty_user_id, day_of_week, start_time, end_time, room)
SELECT
  ctx.tenant_id,
  c.course_id,
  ctx.faculty_id,
  EXTRACT(ISODOW FROM CURRENT_DATE)::int,
  '10:00',
  '11:00',
  'VTOP-DA Lab'
FROM ctx
JOIN (
  SELECT tenant_id, course_id FROM course_upsert
  UNION
  SELECT tenant_id, course_id FROM academic_courses WHERE course_code = 'DA101'
) c ON c.tenant_id = ctx.tenant_id
WHERE ctx.faculty_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM academic_timetables existing
  WHERE existing.tenant_id = ctx.tenant_id
    AND existing.course_id = c.course_id
    AND existing.faculty_user_id = ctx.faculty_id
    AND existing.day_of_week = EXTRACT(ISODOW FROM CURRENT_DATE)::int
    AND existing.start_time = '10:00'
);

-- Ensure student1 is enrolled in the DA QA course.
WITH ctx AS (
  SELECT
    (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1) AS tenant_id,
    (SELECT user_id FROM users WHERE lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1) AS student_id,
    (SELECT course_id FROM academic_courses WHERE course_code = 'DA101' LIMIT 1) AS course_id
)
INSERT INTO student_course_enrollments (
  tenant_id, student_user_id, course_id, semester, status, attendance_percent
)
SELECT ctx.tenant_id, ctx.student_id, ctx.course_id, 5, 'ENROLLED', 92.00
FROM ctx
WHERE ctx.student_id IS NOT NULL AND ctx.course_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM student_course_enrollments existing
  WHERE existing.tenant_id = ctx.tenant_id
    AND existing.student_user_id = ctx.student_id
    AND existing.course_id = ctx.course_id
);

-- Seed one pending DA for student1/faculty1.
WITH ctx AS (
  SELECT
    (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1) AS tenant_id,
    (SELECT user_id FROM users WHERE lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1) AS faculty_id,
    (SELECT course_id FROM academic_courses WHERE course_code = 'DA101' LIMIT 1) AS course_id
)
INSERT INTO academic_assignments (
  tenant_id, course_id, faculty_user_id, title, description, max_marks, due_date
)
SELECT
  ctx.tenant_id,
  ctx.course_id,
  ctx.faculty_id,
  'DA-1: ERP Workflow Case Study',
  'Upload a PDF case study explaining the student-to-faculty digital assignment workflow.',
  20,
  NOW() + INTERVAL '10 days'
FROM ctx
WHERE ctx.faculty_id IS NOT NULL AND ctx.course_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM academic_assignments
  WHERE tenant_id = ctx.tenant_id
    AND course_id = ctx.course_id
    AND title = 'DA-1: ERP Workflow Case Study'
);

-- Production-backed student dashboard + academics data for Sachin.
-- Includes tenant_id for SaaS row-level isolation.

CREATE TABLE IF NOT EXISTS academic_courses (
  course_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  course_code VARCHAR(50) NOT NULL,
  course_name VARCHAR(255) NOT NULL,
  credits INT NOT NULL,
  is_elective BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (tenant_id, course_code)
);

CREATE TABLE IF NOT EXISTS student_course_enrollments (
  enrollment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  student_user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  course_id UUID REFERENCES academic_courses(course_id) ON DELETE CASCADE,
  semester INT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'ENROLLED'
    CHECK (status IN ('ENROLLED', 'COMPLETED', 'FAILED')),
  grade VARCHAR(5),
  grade_points DECIMAL(5,2),
  attendance_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  UNIQUE (tenant_id, student_user_id, course_id)
);

CREATE TABLE IF NOT EXISTS academic_timetables (
  timetable_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  course_id UUID REFERENCES academic_courses(course_id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room VARCHAR(50),
  faculty_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS system_alerts (
  alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_course_enrollments_user
  ON student_course_enrollments(student_user_id);
CREATE INDEX IF NOT EXISTS idx_student_course_enrollments_tenant_user
  ON student_course_enrollments(tenant_id, student_user_id);
CREATE INDEX IF NOT EXISTS idx_academic_timetables_course_day
  ON academic_timetables(course_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_system_alerts_user_unread
  ON system_alerts(tenant_id, user_id, is_read);

WITH ctx AS (
  SELECT
    (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu') AS tenant_id,
    (SELECT user_id FROM users WHERE lower(official_email) = 'y.sachin@mygyanvihar.com') AS sachin_id,
    (SELECT user_id FROM users WHERE lower(official_email) = 'ellwil@mygyanvihar.com') AS ellwil_id
),
courses AS (
  INSERT INTO academic_courses (tenant_id, course_code, course_name, credits, is_elective)
  SELECT ctx.tenant_id, data.course_code, data.course_name, data.credits, data.is_elective
  FROM ctx
  CROSS JOIN (VALUES
    ('CSE101', 'Engineering Mathematics I', 4, false),
    ('CSE102', 'Programming in C', 4, false),
    ('CSE103', 'Basic Electronics', 3, false),
    ('CSE151', 'Engineering Mathematics II', 4, false),
    ('CSE152', 'Object Oriented Programming', 4, false),
    ('CSE153', 'Digital Logic Design', 3, false),
    ('CSE201', 'Data Structures', 4, false),
    ('CSE202', 'Operating Systems', 4, false),
    ('CSE203', 'Database Management Systems', 4, false),
    ('CSE204', 'Computer Networks', 3, false),
    ('CSE205', 'Software Engineering', 3, false),
    ('CSE301', 'Machine Learning', 4, false),
    ('CSE302', 'Cloud Computing Lab', 2, false),
    ('OE501', 'AI for Business', 3, true),
    ('OE502', 'Design Thinking', 3, true),
    ('OE503', 'Entrepreneurship Essentials', 3, true),
    ('OE504', 'Sports Analytics', 3, true)
  ) AS data(course_code, course_name, credits, is_elective)
  ON CONFLICT (tenant_id, course_code) DO UPDATE SET
    course_name = EXCLUDED.course_name,
    credits = EXCLUDED.credits,
    is_elective = EXCLUDED.is_elective
  RETURNING course_id, course_code
)
INSERT INTO student_course_enrollments (
  tenant_id,
  student_user_id,
  course_id,
  semester,
  status,
  grade,
  grade_points,
  attendance_percent
)
SELECT ctx.tenant_id, ctx.sachin_id, c.course_id, data.semester, data.status, data.grade, data.grade_points, data.attendance_percent
FROM ctx
JOIN academic_courses c ON c.tenant_id = ctx.tenant_id
JOIN (VALUES
  ('CSE101', 1, 'COMPLETED', 'A', 9.00, 93.00),
  ('CSE102', 1, 'COMPLETED', 'A-', 8.50, 89.00),
  ('CSE103', 1, 'COMPLETED', 'B+', 8.00, 86.00),
  ('CSE151', 2, 'COMPLETED', 'A', 9.00, 92.00),
  ('CSE152', 2, 'COMPLETED', 'A', 9.00, 88.00),
  ('CSE153', 2, 'COMPLETED', 'B+', 8.00, 85.00),
  ('CSE201', 3, 'COMPLETED', 'A', 9.00, 91.00),
  ('CSE202', 3, 'COMPLETED', 'B+', 8.00, 84.00),
  ('CSE203', 4, 'COMPLETED', 'A-', 8.50, 88.00),
  ('CSE204', 4, 'COMPLETED', 'A', 9.00, 79.00),
  ('CSE205', 4, 'COMPLETED', 'B+', 8.00, 86.00),
  ('CSE301', 5, 'ENROLLED', NULL, NULL, 82.00),
  ('CSE302', 5, 'ENROLLED', NULL, NULL, 90.00)
) AS data(course_code, semester, status, grade, grade_points, attendance_percent)
  ON data.course_code = c.course_code
WHERE ctx.sachin_id IS NOT NULL
ON CONFLICT (tenant_id, student_user_id, course_id) DO UPDATE SET
  semester = EXCLUDED.semester,
  status = EXCLUDED.status,
  grade = EXCLUDED.grade,
  grade_points = EXCLUDED.grade_points,
  attendance_percent = EXCLUDED.attendance_percent;

WITH ctx AS (
  SELECT
    (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu') AS tenant_id,
    (SELECT user_id FROM users WHERE lower(official_email) = 'ellwil@mygyanvihar.com') AS ellwil_id
)
INSERT INTO academic_timetables (tenant_id, course_id, day_of_week, start_time, end_time, room, faculty_user_id)
SELECT ctx.tenant_id, c.course_id, data.day_of_week, data.start_time::time, data.end_time::time, data.room, ctx.ellwil_id
FROM ctx
JOIN academic_courses c ON c.tenant_id = ctx.tenant_id
JOIN (VALUES
  ('CSE301', 5, '10:00', '10:55', 'B-204'),
  ('CSE302', 5, '12:00', '12:55', 'Lab-3'),
  ('OE501', 5, '14:00', '14:55', 'A-105'),
  ('OE502', 5, '15:00', '15:55', 'A-205'),
  ('OE503', 5, '16:00', '16:55', 'Seminar Hall'),
  ('OE504', 5, '11:00', '11:55', 'Sports Lab')
) AS data(course_code, day_of_week, start_time, end_time, room)
  ON data.course_code = c.course_code
WHERE ctx.ellwil_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1
  FROM academic_timetables existing
  WHERE existing.tenant_id = ctx.tenant_id
    AND existing.course_id = c.course_id
    AND existing.day_of_week = data.day_of_week
    AND existing.start_time = data.start_time::time
);

WITH ctx AS (
  SELECT
    (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu') AS tenant_id,
    (SELECT user_id FROM users WHERE lower(official_email) = 'y.sachin@mygyanvihar.com') AS sachin_id
)
INSERT INTO system_alerts (tenant_id, user_id, title, message, is_read)
SELECT ctx.tenant_id, ctx.sachin_id, data.title, data.message, false
FROM ctx
CROSS JOIN (VALUES
  ('Fee Deadline Tomorrow', 'Please clear your semester fee dues before 5 PM tomorrow.'),
  ('Proctor Meeting Scheduled', 'Your proctor has requested a mentorship check-in this week.')
) AS data(title, message)
WHERE ctx.sachin_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1
  FROM system_alerts existing
  WHERE existing.tenant_id = ctx.tenant_id
    AND existing.user_id = ctx.sachin_id
    AND existing.title = data.title
);

-- Run enrollment seed after course upserts so fresh databases can read the
-- inserted course rows outside the data-modifying CTE snapshot.
WITH ctx AS (
  SELECT
    (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu') AS tenant_id,
    (SELECT user_id FROM users WHERE lower(official_email) = 'y.sachin@mygyanvihar.com') AS sachin_id
)
INSERT INTO student_course_enrollments (
  tenant_id,
  student_user_id,
  course_id,
  semester,
  status,
  grade,
  grade_points,
  attendance_percent
)
SELECT ctx.tenant_id, ctx.sachin_id, c.course_id, data.semester, data.status, data.grade, data.grade_points, data.attendance_percent
FROM ctx
JOIN academic_courses c ON c.tenant_id = ctx.tenant_id
JOIN (VALUES
  ('CSE101', 1, 'COMPLETED', 'A', 9.00, 93.00),
  ('CSE102', 1, 'COMPLETED', 'A-', 8.50, 89.00),
  ('CSE103', 1, 'COMPLETED', 'B+', 8.00, 86.00),
  ('CSE151', 2, 'COMPLETED', 'A', 9.00, 92.00),
  ('CSE152', 2, 'COMPLETED', 'A', 9.00, 88.00),
  ('CSE153', 2, 'COMPLETED', 'B+', 8.00, 85.00),
  ('CSE201', 3, 'COMPLETED', 'A', 9.00, 91.00),
  ('CSE202', 3, 'COMPLETED', 'B+', 8.00, 84.00),
  ('CSE203', 4, 'COMPLETED', 'A-', 8.50, 88.00),
  ('CSE204', 4, 'COMPLETED', 'A', 9.00, 79.00),
  ('CSE205', 4, 'COMPLETED', 'B+', 8.00, 86.00),
  ('CSE301', 5, 'ENROLLED', NULL, NULL, 82.00),
  ('CSE302', 5, 'ENROLLED', NULL, NULL, 90.00)
) AS data(course_code, semester, status, grade, grade_points, attendance_percent)
  ON data.course_code = c.course_code
WHERE ctx.sachin_id IS NOT NULL
ON CONFLICT (tenant_id, student_user_id, course_id) DO UPDATE SET
  semester = EXCLUDED.semester,
  status = EXCLUDED.status,
  grade = EXCLUDED.grade,
  grade_points = EXCLUDED.grade_points,
  attendance_percent = EXCLUDED.attendance_percent;

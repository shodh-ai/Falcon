-- B.Tech CE timetable + workload seed (Sem III / V / VII)
-- Source: civil_TT.pdf + jagriti/nagendra/pradeep/ravindra faculty TT PDFs
-- Faculty scope: Ravindra (HOD), Jagriti, Pradeep, Nagendra only (plan-1 accurate mapping)

-- ---------------------------------------------------------------------------
-- 1. HOD hierarchy
-- ---------------------------------------------------------------------------
UPDATE departments d
SET hod_user_id = u.user_id, updated_at = NOW()
FROM users u
WHERE d.dept_name = 'Civil'
  AND lower(u.official_email) = 'ravindra.budania@mygyanvihar.com';

UPDATE users u
SET reporting_officer_id = hod.user_id, updated_at = NOW()
FROM users hod
WHERE lower(hod.official_email) = 'ravindra.budania@mygyanvihar.com'
  AND lower(u.official_email) IN (
    'jagriti.gupta@mygyanvihar.com',
    'pradeepkr.shrivastava@mygyanvihar.com',
    'nagendra.dhakar@mygyanvihar.com'
  );

-- ---------------------------------------------------------------------------
-- 2. Civil student profiles (semester + batch)
-- ---------------------------------------------------------------------------
UPDATE student_profiles sp
SET
  current_semester = v.sem,
  batch = 'B.Tech CE',
  section_code = NULL,
  updated_at = NOW()
FROM users u
JOIN (VALUES
  ('roop.2548471@mygyanvihar.com', 3),
  ('somya.2547552@mygyanvihar.com', 3),
  ('lokesh.2549010@mygyanvihar.com', 5),
  ('gaurav.2451540@mygyanvihar.com', 5),
  ('naveen.2453524@mygyanvihar.com', 5),
  ('ayush.2456444@mygyanvihar.com', 7),
  ('tareem.23181429@mygyanvihar.com', 7)
) AS v(email, sem) ON lower(u.official_email) = lower(v.email)
JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = 'Civil'
WHERE sp.user_id = u.user_id;

-- ---------------------------------------------------------------------------
-- 3. B.Tech CE program + subjects + courses
-- ---------------------------------------------------------------------------
INSERT INTO iam_programs (program_name, program_code, duration_years)
SELECT 'B.Tech CE', 'BTECH-CE', 4
WHERE NOT EXISTS (
  SELECT 1 FROM iam_programs WHERE upper(program_code) = 'BTECH-CE' AND deleted_at IS NULL
);

WITH prog AS (
  SELECT program_id FROM iam_programs
  WHERE upper(program_code) = 'BTECH-CE' AND deleted_at IS NULL
  LIMIT 1
)
INSERT INTO academic_subjects (subject_code, subject_name, subject_shortname, program_id, credits, subject_type, is_active)
SELECT v.subject_code, v.subject_name, v.subject_shortname, p.program_id, v.credits, v.subject_type, true
FROM prog p
CROSS JOIN (VALUES
  ('CE3001T', 'Building Material and Construction', 'CE3001T', 4, 'THEORY'),
  ('CE3002T', 'Structural Analysis-I', 'CE3002T', 4, 'THEORY'),
  ('CE3003T', 'Fluid Mechanics', 'CE3003T', 4, 'THEORY'),
  ('CE3004T', 'Surveying-I', 'CE3004T', 4, 'THEORY'),
  ('CE3005T', 'Solid and Hazardous Waste Management', 'CE3005T', 3, 'THEORY'),
  ('CE3006T', 'Soft Skill', 'CE3006T', 2, 'THEORY'),
  ('CE3007P', 'Fluid Mechanics Lab', 'CE3007P', 2, 'LAB'),
  ('CE3008P', 'Surveying Lab', 'CE3008P', 2, 'LAB'),
  ('CE3009P', 'Structural Analysis Lab', 'CE3009P', 2, 'LAB'),
  ('CE3010P', 'Building Material Lab', 'CE3010P', 2, 'LAB'),
  ('CE3011T', 'Election and Electoral Processes in India', 'CE3011T', 2, 'THEORY'),
  ('CE302T', 'Repair and Rehabilitation of Structures', 'CE302T', 3, 'THEORY'),
  ('CE305T', 'Transportation Engineering-I', 'CE305T', 4, 'THEORY'),
  ('CE306T', 'Design of Concrete Structure-I', 'CE306T', 4, 'THEORY'),
  ('CE307T', 'Environmental Engineering', 'CE307T', 4, 'THEORY'),
  ('CE315T', 'Soil Mechanics', 'CE315T', 4, 'THEORY'),
  ('CE351P', 'Environmental Engineering Lab', 'CE351P', 2, 'LAB'),
  ('CE353P', 'Soil Mechanics Lab', 'CE353P', 2, 'LAB'),
  ('CE355P', 'Design of Concrete Structure Lab-I', 'CE355P', 2, 'LAB'),
  ('CE357P', 'Stadd Pro Lab', 'CE357P', 2, 'LAB'),
  ('CE401T', 'Intellectual Property Rights', 'CE401T', 2, 'THEORY'),
  ('CE403T', 'Foundation Engineering', 'CE403T', 4, 'THEORY'),
  ('CE405T', 'Construction Project Management', 'CE405T', 4, 'THEORY'),
  ('CE406T', 'Bridge Engineering', 'CE406T', 4, 'THEORY'),
  ('CE407T', 'Soft Skill', 'CE407T', 2, 'THEORY'),
  ('CE451P', 'Foundation Engineering Lab', 'CE451P', 2, 'LAB'),
  ('CEUC201T', 'Economics and Social Sciences', 'CEUC201T', 2, 'THEORY'),
  ('EM301T', 'Employability Skills-III', 'EM301T', 2, 'THEORY'),
  ('EM401T', 'Group Discussion Aptitude and Reasoning', 'EM401T', 2, 'THEORY'),
  ('PE403P', 'Major Project', 'PE403P', 6, 'LAB'),
  ('PT303P', 'Industrial Training Seminar', 'PT303P', 2, 'LAB'),
  ('SM402P', 'Seminar', 'SM402P', 2, 'LAB')
) AS v(subject_code, subject_name, subject_shortname, credits, subject_type)
ON CONFLICT (subject_code) DO UPDATE SET
  subject_name = EXCLUDED.subject_name,
  subject_shortname = EXCLUDED.subject_shortname,
  credits = EXCLUDED.credits,
  subject_type = EXCLUDED.subject_type,
  is_active = true,
  updated_at = NOW();

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
subject_rows AS (
  SELECT subject_id, subject_code, subject_name, credits
  FROM academic_subjects
  WHERE subject_code IN ('CE3001T', 'CE3002T', 'CE3003T', 'CE3004T', 'CE3005T', 'CE3006T', 'CE3007P', 'CE3008P', 'CE3009P', 'CE3010P', 'CE3011T', 'CE302T', 'CE305T', 'CE306T', 'CE307T', 'CE315T', 'CE351P', 'CE353P', 'CE355P', 'CE357P', 'CE401T', 'CE403T', 'CE405T', 'CE406T', 'CE407T', 'CE451P', 'CEUC201T', 'EM301T', 'EM401T', 'PE403P', 'PT303P', 'SM402P')
)
INSERT INTO academic_courses (tenant_id, course_code, course_name, credits, is_elective, course_type)
SELECT
  t.tenant_id,
  s.subject_code,
  s.subject_name,
  s.credits,
  false,
  CASE WHEN s.subject_code LIKE '%P' OR s.subject_code LIKE '%LAB' THEN 'LAB' ELSE 'CORE' END
FROM tenant t
CROSS JOIN subject_rows s
ON CONFLICT (tenant_id, course_code) DO UPDATE SET
  course_name = EXCLUDED.course_name,
  credits = EXCLUDED.credits,
  course_type = EXCLUDED.course_type;

-- ---------------------------------------------------------------------------
-- 4. Course allocations (nullable faculty for outsider-taught subjects)
-- ---------------------------------------------------------------------------
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
subject_rows AS (
  SELECT subject_id, subject_code FROM academic_subjects
),
course_rows AS (
  SELECT course_id, course_code FROM academic_courses
),
allocations AS (
  SELECT * FROM (VALUES
  ('CE3001T', 'B.Tech CE', 'III', 'ravindra.budania@mygyanvihar.com'),
  ('CE3002T', 'B.Tech CE', 'III', 'nagendra.dhakar@mygyanvihar.com'),
  ('CE3003T', 'B.Tech CE', 'III', NULL),
  ('CE3004T', 'B.Tech CE', 'III', 'pradeepkr.shrivastava@mygyanvihar.com'),
  ('CE3005T', 'B.Tech CE', 'III', 'jagriti.gupta@mygyanvihar.com'),
  ('CE3006T', 'B.Tech CE', 'III', 'pradeepkr.shrivastava@mygyanvihar.com'),
  ('CEUC201T', 'B.Tech CE', 'III', NULL),
  ('CE3011T', 'B.Tech CE', 'III', NULL),
  ('CE3009P', 'B.Tech CE', 'III', 'nagendra.dhakar@mygyanvihar.com'),
  ('CE3010P', 'B.Tech CE', 'III', 'ravindra.budania@mygyanvihar.com'),
  ('CE3007P', 'B.Tech CE', 'III', NULL),
  ('CE3008P', 'B.Tech CE', 'III', 'pradeepkr.shrivastava@mygyanvihar.com'),
  ('CE315T', 'B.Tech CE', 'V', NULL),
  ('EM301T', 'B.Tech CE', 'V', NULL),
  ('CE302T', 'B.Tech CE', 'V', 'jagriti.gupta@mygyanvihar.com'),
  ('CE305T', 'B.Tech CE', 'V', NULL),
  ('CE306T', 'B.Tech CE', 'V', 'nagendra.dhakar@mygyanvihar.com'),
  ('CE307T', 'B.Tech CE', 'V', 'pradeepkr.shrivastava@mygyanvihar.com'),
  ('CE351P', 'B.Tech CE', 'V', 'pradeepkr.shrivastava@mygyanvihar.com'),
  ('CE355P', 'B.Tech CE', 'V', 'nagendra.dhakar@mygyanvihar.com'),
  ('CE357P', 'B.Tech CE', 'V', 'jagriti.gupta@mygyanvihar.com'),
  ('CE353P', 'B.Tech CE', 'V', NULL),
  ('PT303P', 'B.Tech CE', 'V', 'pradeepkr.shrivastava@mygyanvihar.com'),
  ('CE403T', 'B.Tech CE', 'VII', 'jagriti.gupta@mygyanvihar.com'),
  ('CE405T', 'B.Tech CE', 'VII', 'ravindra.budania@mygyanvihar.com'),
  ('CE406T', 'B.Tech CE', 'VII', 'nagendra.dhakar@mygyanvihar.com'),
  ('EM401T', 'B.Tech CE', 'VII', NULL),
  ('CE401T', 'B.Tech CE', 'VII', NULL),
  ('CE451P', 'B.Tech CE', 'VII', 'jagriti.gupta@mygyanvihar.com'),
  ('PE403P', 'B.Tech CE', 'VII', 'jagriti.gupta@mygyanvihar.com'),
  ('SM402P', 'B.Tech CE', 'VII', 'jagriti.gupta@mygyanvihar.com'),
  ('CE407T', 'B.Tech CE', 'VII', 'ravindra.budania@mygyanvihar.com')
  ) AS a(subject_code, program_name, semester, faculty_email)
)
INSERT INTO academic_course_allocations (
  tenant_id, subject_id, program_name, semester, faculty_user_id, academic_year, course_id, status
)
SELECT
  t.tenant_id,
  s.subject_id,
  a.program_name,
  a.semester,
  u.user_id,
  '2026-2027',
  c.course_id,
  'ACTIVE'
FROM allocations a
JOIN subject_rows s ON s.subject_code = a.subject_code
JOIN course_rows c ON c.course_code = s.subject_code
LEFT JOIN users u ON a.faculty_email IS NOT NULL AND lower(u.official_email) = lower(a.faculty_email)
CROSS JOIN tenant t
ON CONFLICT (tenant_id, subject_id, program_name, semester, academic_year) DO UPDATE SET
  faculty_user_id = EXCLUDED.faculty_user_id,
  course_id = EXCLUDED.course_id,
  status = 'ACTIVE',
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 5. Timetable slots
-- ---------------------------------------------------------------------------
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
course_rows AS (
  SELECT course_id, course_code FROM academic_courses
),
slot_rows AS (
  SELECT * FROM (VALUES
  ('CE3002T', 'III', 'LT-2', 1, '10:00'::time, '10:50'::time, 'nagendra.dhakar@mygyanvihar.com'),
  ('CE3001T', 'III', 'LT-2', 1, '10:50'::time, '11:40'::time, 'ravindra.budania@mygyanvihar.com'),
  ('CE3001T', 'III', 'LT-2', 1, '11:40'::time, '12:30'::time, 'ravindra.budania@mygyanvihar.com'),
  ('CE3005T', 'III', 'LT-2', 1, '13:30'::time, '14:20'::time, 'jagriti.gupta@mygyanvihar.com'),
  ('CE3004T', 'III', 'LT-2', 2, '09:00'::time, '10:00'::time, 'pradeepkr.shrivastava@mygyanvihar.com'),
  ('CE3001T', 'III', 'LT-2', 2, '10:00'::time, '10:50'::time, 'ravindra.budania@mygyanvihar.com'),
  ('CE3001T', 'III', 'LT-2', 2, '10:50'::time, '11:40'::time, 'ravindra.budania@mygyanvihar.com'),
  ('CE3005T', 'III', 'LT-2', 2, '13:30'::time, '14:20'::time, 'jagriti.gupta@mygyanvihar.com'),
  ('CE3003T', 'III', 'LT-2', 3, '09:00'::time, '10:00'::time, NULL),
  ('CE3004T', 'III', 'LT-2', 3, '10:00'::time, '10:50'::time, 'pradeepkr.shrivastava@mygyanvihar.com'),
  ('CE3004T', 'III', 'LT-2', 3, '10:50'::time, '11:40'::time, 'pradeepkr.shrivastava@mygyanvihar.com'),
  ('CE3004T', 'III', 'LT-2', 3, '11:40'::time, '12:30'::time, 'pradeepkr.shrivastava@mygyanvihar.com'),
  ('CE3003T', 'III', 'LT-2', 4, '09:00'::time, '10:00'::time, NULL),
  ('CE3003T', 'III', 'LT-2', 4, '10:00'::time, '10:50'::time, NULL),
  ('CE3001T', 'III', 'LT-2', 4, '10:50'::time, '11:40'::time, 'ravindra.budania@mygyanvihar.com'),
  ('CE3006T', 'III', 'LT-2', 4, '11:40'::time, '12:30'::time, 'pradeepkr.shrivastava@mygyanvihar.com'),
  ('CE3004T', 'III', 'LT-2', 4, '13:30'::time, '14:20'::time, 'pradeepkr.shrivastava@mygyanvihar.com'),
  ('CE3002T', 'III', 'LT-2', 4, '15:10'::time, '16:00'::time, 'nagendra.dhakar@mygyanvihar.com'),
  ('CE3003T', 'III', 'LT-2', 5, '09:00'::time, '10:00'::time, NULL),
  ('CE3003T', 'III', 'LT-2', 5, '10:00'::time, '10:50'::time, NULL),
  ('CE3002T', 'III', 'LT-2', 5, '13:30'::time, '14:20'::time, 'nagendra.dhakar@mygyanvihar.com'),
  ('CE3005T', 'III', 'LT-2', 6, '09:00'::time, '10:00'::time, 'jagriti.gupta@mygyanvihar.com'),
  ('CE3002T', 'III', 'LT-2', 6, '15:10'::time, '16:00'::time, 'nagendra.dhakar@mygyanvihar.com'),
  ('CE3003T', 'III', 'LT-2', 6, '15:10'::time, '16:00'::time, NULL),
  ('CE3009P', 'III', 'RMT Lab', 2, '12:30'::time, '13:30'::time, 'nagendra.dhakar@mygyanvihar.com'),
  ('CE3010P', 'III', 'RMT Lab', 1, '12:30'::time, '13:30'::time, 'ravindra.budania@mygyanvihar.com'),
  ('CE3008P', 'III', 'Survey Lab', 4, '12:30'::time, '13:30'::time, 'pradeepkr.shrivastava@mygyanvihar.com'),
  ('CE3007P', 'III', 'FM Lab', 3, '12:30'::time, '13:30'::time, NULL),
  ('CE315T', 'V', 'Structure Lab', 1, '10:00'::time, '10:50'::time, NULL),
  ('CE306T', 'V', 'Structure Lab', 1, '10:50'::time, '11:40'::time, 'nagendra.dhakar@mygyanvihar.com'),
  ('CE306T', 'V', 'Structure Lab', 1, '11:40'::time, '12:30'::time, 'nagendra.dhakar@mygyanvihar.com'),
  ('CE305T', 'V', 'Structure Lab', 1, '13:30'::time, '14:20'::time, NULL),
  ('CE315T', 'V', 'Structure Lab', 2, '09:00'::time, '10:00'::time, NULL),
  ('CE306T', 'V', 'Structure Lab', 2, '10:00'::time, '10:50'::time, 'nagendra.dhakar@mygyanvihar.com'),
  ('CE306T', 'V', 'Structure Lab', 2, '10:50'::time, '11:40'::time, 'nagendra.dhakar@mygyanvihar.com'),
  ('CE305T', 'V', 'Structure Lab', 2, '13:30'::time, '14:20'::time, NULL),
  ('EM301T', 'V', 'Structure Lab', 2, '14:20'::time, '15:10'::time, NULL),
  ('CE307T', 'V', 'Structure Lab', 3, '09:00'::time, '10:00'::time, 'pradeepkr.shrivastava@mygyanvihar.com'),
  ('EM301T', 'V', 'Structure Lab', 3, '10:00'::time, '10:50'::time, NULL),
  ('CE302T', 'V', 'Structure Lab', 4, '09:00'::time, '10:00'::time, 'jagriti.gupta@mygyanvihar.com'),
  ('CE307T', 'V', 'Structure Lab', 4, '10:00'::time, '10:50'::time, 'pradeepkr.shrivastava@mygyanvihar.com'),
  ('CE306T', 'V', 'Structure Lab', 4, '13:30'::time, '14:20'::time, 'nagendra.dhakar@mygyanvihar.com'),
  ('CE307T', 'V', 'Structure Lab', 5, '09:00'::time, '10:00'::time, 'pradeepkr.shrivastava@mygyanvihar.com'),
  ('CE315T', 'V', 'Structure Lab', 5, '10:00'::time, '10:50'::time, NULL),
  ('CE305T', 'V', 'Structure Lab', 5, '13:30'::time, '14:20'::time, NULL),
  ('CE302T', 'V', 'Structure Lab', 5, '14:20'::time, '15:10'::time, 'jagriti.gupta@mygyanvihar.com'),
  ('CE315T', 'V', 'Structure Lab', 6, '09:00'::time, '10:00'::time, NULL),
  ('CE302T', 'V', 'Structure Lab', 6, '10:00'::time, '10:50'::time, 'jagriti.gupta@mygyanvihar.com'),
  ('CE355P', 'V', 'Structure Lab', 1, '12:30'::time, '13:30'::time, 'nagendra.dhakar@mygyanvihar.com'),
  ('CE353P', 'V', 'Workshop', 2, '12:30'::time, '13:30'::time, NULL),
  ('CE357P', 'V', 'Computer Lab', 3, '12:30'::time, '13:30'::time, 'jagriti.gupta@mygyanvihar.com'),
  ('CE351P', 'V', 'EE Lab (RB)', 5, '12:30'::time, '13:30'::time, 'pradeepkr.shrivastava@mygyanvihar.com'),
  ('PT303P', 'V', 'Computer Lab', 4, '12:30'::time, '13:30'::time, 'pradeepkr.shrivastava@mygyanvihar.com'),
  ('CE403T', 'VII', 'Survey Lab', 1, '10:00'::time, '10:50'::time, 'jagriti.gupta@mygyanvihar.com'),
  ('CE401T', 'VII', 'Survey Lab', 1, '10:50'::time, '11:40'::time, NULL),
  ('CE405T', 'VII', 'Survey Lab', 2, '09:00'::time, '10:00'::time, 'ravindra.budania@mygyanvihar.com'),
  ('CE406T', 'VII', 'Survey Lab', 2, '13:30'::time, '14:20'::time, 'nagendra.dhakar@mygyanvihar.com'),
  ('EM401T', 'VII', 'Survey Lab', 2, '14:20'::time, '15:10'::time, NULL),
  ('CE403T', 'VII', 'Survey Lab', 3, '09:00'::time, '10:00'::time, 'jagriti.gupta@mygyanvihar.com'),
  ('CE401T', 'VII', 'Survey Lab', 3, '10:00'::time, '10:50'::time, NULL),
  ('CE406T', 'VII', 'Survey Lab', 4, '09:00'::time, '10:00'::time, 'nagendra.dhakar@mygyanvihar.com'),
  ('EM401T', 'VII', 'Survey Lab', 4, '10:00'::time, '10:50'::time, NULL),
  ('CE403T', 'VII', 'Survey Lab', 4, '13:30'::time, '14:20'::time, 'jagriti.gupta@mygyanvihar.com'),
  ('CE407T', 'VII', 'Survey Lab', 4, '14:20'::time, '15:10'::time, 'ravindra.budania@mygyanvihar.com'),
  ('CE406T', 'VII', 'Survey Lab', 5, '09:00'::time, '10:00'::time, 'nagendra.dhakar@mygyanvihar.com'),
  ('CE405T', 'VII', 'Survey Lab', 5, '10:00'::time, '10:50'::time, 'ravindra.budania@mygyanvihar.com'),
  ('CE401T', 'VII', 'Survey Lab', 6, '09:00'::time, '10:00'::time, NULL),
  ('CE405T', 'VII', 'Survey Lab', 6, '10:00'::time, '10:50'::time, 'ravindra.budania@mygyanvihar.com'),
  ('CE451P', 'VII', 'Workshop', 3, '12:30'::time, '13:30'::time, 'jagriti.gupta@mygyanvihar.com'),
  ('PE403P', 'VII', 'Project Lab', 1, '12:30'::time, '13:30'::time, 'jagriti.gupta@mygyanvihar.com'),
  ('PE403P', 'VII', 'Project Lab', 4, '12:30'::time, '13:30'::time, 'jagriti.gupta@mygyanvihar.com'),
  ('SM402P', 'VII', 'Computer lab', 5, '12:30'::time, '13:30'::time, 'jagriti.gupta@mygyanvihar.com')
  ) AS s(course_code, semester, room, day_of_week, start_time, end_time, faculty_email)
)
INSERT INTO academic_timetables (tenant_id, course_id, day_of_week, start_time, end_time, room, faculty_user_id)
SELECT
  t.tenant_id,
  c.course_id,
  s.day_of_week,
  s.start_time,
  s.end_time,
  s.room,
  u.user_id
FROM slot_rows s
JOIN course_rows c ON c.course_code = s.course_code
LEFT JOIN users u ON s.faculty_email IS NOT NULL AND lower(u.official_email) = lower(s.faculty_email)
CROSS JOIN tenant t
ON CONFLICT (tenant_id, course_id, day_of_week, start_time, end_time)
WHERE deleted_at IS NULL
DO UPDATE SET
  room = EXCLUDED.room,
  faculty_user_id = EXCLUDED.faculty_user_id;

-- ---------------------------------------------------------------------------
-- 6. Student enrollments
-- ---------------------------------------------------------------------------
WITH civil_students AS (
  SELECT u.user_id, sp.tenant_id, sp.current_semester, sp.section_code, sp.batch
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = 'Civil'
  WHERE sp.current_semester IN (3, 5, 7)
    AND sp.batch = 'B.Tech CE'
),
matching_allocations AS (
  SELECT
    s.user_id,
    s.tenant_id,
    s.current_semester,
    s.section_code,
    a.course_id
  FROM civil_students s
  JOIN academic_course_allocations a ON a.tenant_id = s.tenant_id
  WHERE a.academic_year = '2026-2027'
    AND a.status = 'ACTIVE'
    AND a.course_id IS NOT NULL
    AND upper(replace(COALESCE(a.program_name, ''), ' ', '')) = upper(replace(COALESCE(s.batch, 'B.Tech CE'), ' ', ''))
    AND CASE upper(split_part(COALESCE(a.semester, ''), '-', 1))
      WHEN 'I' THEN 1 WHEN 'II' THEN 2 WHEN 'III' THEN 3 WHEN 'IV' THEN 4
      WHEN 'V' THEN 5 WHEN 'VI' THEN 6 WHEN 'VII' THEN 7 WHEN 'VIII' THEN 8
      ELSE NULL END = s.current_semester
)
INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, section_code, status)
SELECT tenant_id, user_id, course_id, current_semester, section_code, 'ENROLLED'
FROM matching_allocations
ON CONFLICT (tenant_id, student_user_id, course_id) DO UPDATE SET
  semester = EXCLUDED.semester,
  section_code = EXCLUDED.section_code,
  status = CASE
    WHEN student_course_enrollments.status = 'COMPLETED' THEN student_course_enrollments.status
    ELSE 'ENROLLED'
  END;

-- ---------------------------------------------------------------------------
-- 7. Mentorships (sem 5 → Jagriti, sem 7 → Pradeep; sem 3 PT has no login)
-- ---------------------------------------------------------------------------
WITH mentor_map AS (
  SELECT * FROM (VALUES
  (5, 'jagriti.gupta@mygyanvihar.com'),
  (7, 'pradeepkr.shrivastava@mygyanvihar.com')
  ) AS m(semester_num, mentor_email)
),
civil_students AS (
  SELECT u.user_id, sp.current_semester
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = 'Civil'
  WHERE sp.batch = 'B.Tech CE' AND sp.current_semester IN (5, 7)
)
INSERT INTO academic_mentorships (student_user_id, proctor_user_id, is_active)
SELECT ps.user_id, mentor.user_id, true
FROM civil_students ps
JOIN mentor_map mm ON mm.semester_num = ps.current_semester
JOIN users mentor ON lower(mentor.official_email) = lower(mm.mentor_email)
ON CONFLICT (student_user_id) DO UPDATE SET
  proctor_user_id = EXCLUDED.proctor_user_id,
  is_active = true,
  updated_at = NOW();

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'academics.civil_timetable',
  'Student / Faculty / HOD',
  'roop.2548471@mygyanvihar.com',
  'Civil timetable & workload',
  'B.Tech CE Sem III/V/VII — 7 students, HOD Ravindra, faculty Jagriti/Pradeep/Nagendra',
  'Source: civil_TT.pdf + faculty TT PDFs (plan-1 accurate faculty mapping)'
)
ON CONFLICT (smoke_key) DO UPDATE SET
  sample_record = EXCLUDED.sample_record,
  notes = EXCLUDED.notes,
  seeded_at = NOW();

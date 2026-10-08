-- Pharmacy B.Pharm timetable + workload seed (Sem III / V / VII)
-- Source: pharmacy_TT.pdf + Pharmacy_Faculty_Workload_JULY -DEC. 2026.xlsx
-- Faculty scope: Manish Gupta, Mahendra Saini, Amit Kaushik (+ HOD hierarchy for Hitesh)

-- ---------------------------------------------------------------------------
-- 1. HOD hierarchy
-- ---------------------------------------------------------------------------
UPDATE departments d
SET hod_user_id = u.user_id, updated_at = NOW()
FROM users u
WHERE d.dept_name = 'Pharmacy'
  AND lower(u.official_email) = 'hitesh.kumar@mygyanvihar.com';

UPDATE users u
SET reporting_officer_id = hod.user_id, updated_at = NOW()
FROM users hod
WHERE lower(hod.official_email) = 'hitesh.kumar@mygyanvihar.com'
  AND lower(u.official_email) IN (
    'manish1.gupta@mygyanvihar.com',
    'mahendra.saini@mygyanvihar.com',
    'amit.kaushik@mygyanvihar.com'
  );

-- ---------------------------------------------------------------------------
-- 2. Pharmacy student profiles (semester + batch)
-- ---------------------------------------------------------------------------
UPDATE student_profiles sp
SET
  current_semester = v.sem,
  batch = 'B.Pharm',
  section_code = NULL,
  updated_at = NOW()
FROM users u
JOIN (VALUES
  ('lakshya.2548727@mygyanvihar.com', 3),
  ('kartik.2549620@mygyanvihar.com', 3),
  ('ashish.2548715@mygyanvihar.com', 3),
  ('vinit.2546632@mygyanvihar.com', 3),
  ('shubham.2547213@mygyanvihar.com', 3),
  ('akshit.2548729@mygyanvihar.com', 3),
  ('nakul.2448315@mygyanvihar.com', 5),
  ('tejasva.2449080@mygyanvihar.com', 5),
  ('arshi.2451125@mygyanvihar.com', 5),
  ('srishti.2451136@mygyanvihar.com', 5),
  ('muskan.2450354@mygyanvihar.com', 5),
  ('deepika.2346664@mygyanvihar.com', 7),
  ('rahul.2346233@mygyanvihar.com', 7),
  ('tisha.2346536@mygyanvihar.com', 7),
  ('bhavishya.23181424@mygyanvihar.com', 7),
  ('sandeep.23180646@mygyanvihar.com', 7),
  ('praveen.23181521@mygyanvihar.com', 7)
) AS v(email, sem) ON lower(u.official_email) = lower(v.email)
JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = 'Pharmacy'
WHERE sp.user_id = u.user_id;

-- ---------------------------------------------------------------------------
-- 3. B.Pharm program + subjects + courses
-- ---------------------------------------------------------------------------
INSERT INTO iam_programs (program_name, program_code, duration_years)
SELECT 'B.Pharm', 'BPHARM', 4
WHERE NOT EXISTS (
  SELECT 1 FROM iam_programs WHERE upper(program_code) = 'BPHARM' AND deleted_at IS NULL
);

WITH prog AS (
  SELECT program_id FROM iam_programs
  WHERE upper(program_code) = 'BPHARM' AND deleted_at IS NULL
  LIMIT 1
)
INSERT INTO academic_subjects (subject_code, subject_name, subject_shortname, program_id, credits, subject_type, is_active)
SELECT v.subject_code, v.subject_name, v.subject_shortname, p.program_id, v.credits, v.subject_type, true
FROM prog p
CROSS JOIN (VALUES
  ('BP301P', 'Physical Pharmaceutics I Practical', 'BP301P', 2, 'LAB'),
  ('BP301T', 'Physical Pharmaceutics I', 'BP301T', 4, 'THEORY'),
  ('BP302P', 'Pharmaceutical Organic Chemistry I Practical', 'BP302P', 2, 'LAB'),
  ('BP302T', 'Pharmaceutical Organic Chemistry I', 'BP302T', 4, 'THEORY'),
  ('BP303P', 'Pharmaceutical Microbiology Practical', 'BP303P', 2, 'LAB'),
  ('BP303T', 'Pharmaceutical Microbiology', 'BP303T', 4, 'THEORY'),
  ('BP304P', 'Pharmaceutical Engineering Practical', 'BP304P', 2, 'LAB'),
  ('BP304T', 'Pharmaceutical Engineering', 'BP304T', 3, 'THEORY'),
  ('BP501T', 'Medicinal Chemistry I', 'BP501T', 4, 'THEORY'),
  ('BP502P', 'Industrial Pharmacy I Practical', 'BP502P', 2, 'LAB'),
  ('BP502T', 'Industrial Pharmacy I', 'BP502T', 4, 'THEORY'),
  ('BP503P', 'Pharmacognosy and Phytochemistry II Practical', 'BP503P', 2, 'LAB'),
  ('BP503T', 'Pharmacognosy and Phytochemistry II', 'BP503T', 4, 'THEORY'),
  ('BP504P', 'Pharmacology II Practical', 'BP504P', 2, 'LAB'),
  ('BP504T', 'Pharmacology II', 'BP504T', 4, 'THEORY'),
  ('BP505T', 'Pharmaceutical Jurisprudence', 'BP505T', 4, 'THEORY'),
  ('BP701T', 'Novel Drug Delivery Systems', 'BP701T', 4, 'THEORY'),
  ('BP702P', 'Instrumental Methods of Analysis Practical', 'BP702P', 2, 'LAB'),
  ('BP702T', 'Instrumental Methods of Analysis', 'BP702T', 4, 'THEORY'),
  ('BP703T', 'Pharmacy Practice', 'BP703T', 4, 'THEORY'),
  ('BP704T', 'Industrial Pharmacy II', 'BP704T', 4, 'THEORY'),
  ('BP706PS', 'Practice School', 'BP706PS', 6, 'LAB')
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
  WHERE subject_code IN ('BP301P', 'BP301T', 'BP302P', 'BP302T', 'BP303P', 'BP303T', 'BP304P', 'BP304T', 'BP501T', 'BP502P', 'BP502T', 'BP503P', 'BP503T', 'BP504P', 'BP504T', 'BP505T', 'BP701T', 'BP702P', 'BP702T', 'BP703T', 'BP704T', 'BP706PS')
)
INSERT INTO academic_courses (tenant_id, course_code, course_name, credits, is_elective, course_type)
SELECT
  t.tenant_id,
  s.subject_code,
  s.subject_name,
  s.credits,
  false,
  CASE WHEN s.subject_code LIKE '%P' THEN 'LAB' ELSE 'CORE' END
FROM tenant t
CROSS JOIN subject_rows s
ON CONFLICT (tenant_id, course_code) DO UPDATE SET
  course_name = EXCLUDED.course_name,
  credits = EXCLUDED.credits,
  course_type = EXCLUDED.course_type;

-- ---------------------------------------------------------------------------
-- 4. Course allocations (Manish / Mahendra / Amit only)
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
  ('BP301T', 'B.Pharm', 'III', 'mahendra.saini@mygyanvihar.com'),
  ('BP301P', 'B.Pharm', 'III', 'mahendra.saini@mygyanvihar.com'),
  ('BP302T', 'B.Pharm', 'III', 'manish1.gupta@mygyanvihar.com'),
  ('BP302P', 'B.Pharm', 'III', 'manish1.gupta@mygyanvihar.com'),
  ('BP303T', 'B.Pharm', 'III', 'amit.kaushik@mygyanvihar.com'),
  ('BP303P', 'B.Pharm', 'III', 'amit.kaushik@mygyanvihar.com'),
  ('BP304T', 'B.Pharm', 'III', 'manish1.gupta@mygyanvihar.com'),
  ('BP304P', 'B.Pharm', 'III', 'manish1.gupta@mygyanvihar.com'),
  ('BP501T', 'B.Pharm', 'V', 'mahendra.saini@mygyanvihar.com'),
  ('BP502T', 'B.Pharm', 'V', 'manish1.gupta@mygyanvihar.com'),
  ('BP502P', 'B.Pharm', 'V', 'manish1.gupta@mygyanvihar.com'),
  ('BP505T', 'B.Pharm', 'V', 'amit.kaushik@mygyanvihar.com'),
  ('BP503T', 'B.Pharm', 'V', 'mahendra.saini@mygyanvihar.com'),
  ('BP503P', 'B.Pharm', 'V', 'mahendra.saini@mygyanvihar.com'),
  ('BP504T', 'B.Pharm', 'V', 'amit.kaushik@mygyanvihar.com'),
  ('BP504P', 'B.Pharm', 'V', 'amit.kaushik@mygyanvihar.com'),
  ('BP701T', 'B.Pharm', 'VII', 'mahendra.saini@mygyanvihar.com'),
  ('BP702T', 'B.Pharm', 'VII', 'amit.kaushik@mygyanvihar.com'),
  ('BP702P', 'B.Pharm', 'VII', 'amit.kaushik@mygyanvihar.com'),
  ('BP703T', 'B.Pharm', 'VII', 'amit.kaushik@mygyanvihar.com'),
  ('BP704T', 'B.Pharm', 'VII', 'manish1.gupta@mygyanvihar.com'),
  ('BP706PS', 'B.Pharm', 'VII', 'manish1.gupta@mygyanvihar.com')
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
JOIN users u ON lower(u.official_email) = lower(a.faculty_email)
CROSS JOIN tenant t
ON CONFLICT (tenant_id, subject_id, program_name, semester, academic_year) DO UPDATE SET
  faculty_user_id = EXCLUDED.faculty_user_id,
  course_id = EXCLUDED.course_id,
  status = 'ACTIVE',
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 5. Timetable slots from pharmacy_TT.pdf
-- ---------------------------------------------------------------------------
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
course_rows AS (
  SELECT course_id, course_code FROM academic_courses
),
slot_rows AS (
  SELECT * FROM (VALUES
  ('BP301P', 'III', 'LT-28', 1, '09:00'::time, '12:30'::time, 'mahendra.saini@mygyanvihar.com'),
  ('BP303P', 'III', 'LT-28', 1, '09:00'::time, '12:30'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP302P', 'III', 'LT-28', 1, '09:00'::time, '12:30'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP302T', 'III', 'LT-28', 1, '13:30'::time, '14:20'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP303T', 'III', 'LT-28', 1, '14:20'::time, '15:10'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP301T', 'III', 'LT-28', 1, '15:10'::time, '16:00'::time, 'mahendra.saini@mygyanvihar.com'),
  ('BP301P', 'III', 'LT-28', 2, '10:00'::time, '12:30'::time, 'mahendra.saini@mygyanvihar.com'),
  ('BP303P', 'III', 'LT-28', 2, '10:00'::time, '12:30'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP304P', 'III', 'LT-28', 2, '10:00'::time, '12:30'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP303T', 'III', 'LT-28', 2, '13:30'::time, '14:20'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP301T', 'III', 'LT-28', 2, '14:20'::time, '15:10'::time, 'mahendra.saini@mygyanvihar.com'),
  ('BP304T', 'III', 'LT-28', 2, '15:10'::time, '16:00'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP304T', 'III', 'LT-28', 3, '09:00'::time, '10:00'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP303T', 'III', 'LT-28', 3, '10:00'::time, '10:50'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP302T', 'III', 'LT-28', 3, '13:30'::time, '14:20'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP301P', 'III', 'LT-28', 4, '10:00'::time, '12:30'::time, 'mahendra.saini@mygyanvihar.com'),
  ('BP304P', 'III', 'LT-28', 4, '10:00'::time, '12:30'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP302P', 'III', 'LT-28', 4, '10:00'::time, '12:30'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP301T', 'III', 'LT-28', 4, '13:30'::time, '14:20'::time, 'mahendra.saini@mygyanvihar.com'),
  ('BP304T', 'III', 'LT-28', 4, '14:20'::time, '15:10'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP302T', 'III', 'LT-28', 4, '15:10'::time, '16:00'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP304P', 'III', 'LT-28', 5, '10:00'::time, '12:30'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP303P', 'III', 'LT-28', 5, '10:00'::time, '12:30'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP302P', 'III', 'LT-28', 5, '10:00'::time, '12:30'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP301T', 'III', 'LT-28', 5, '13:30'::time, '14:20'::time, 'mahendra.saini@mygyanvihar.com'),
  ('BP302T', 'III', 'LT-28', 5, '14:20'::time, '15:10'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP303T', 'III', 'LT-28', 6, '09:00'::time, '10:00'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP304T', 'III', 'LT-28', 6, '10:00'::time, '10:50'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP501T', 'V', 'LT-25', 1, '09:00'::time, '10:00'::time, 'mahendra.saini@mygyanvihar.com'),
  ('BP502T', 'V', 'LT-25', 1, '10:00'::time, '10:50'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP505T', 'V', 'LT-25', 1, '10:50'::time, '11:40'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP502P', 'V', 'LT-25', 1, '13:30'::time, '16:50'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP503T', 'V', 'LT-25', 2, '09:00'::time, '10:00'::time, 'mahendra.saini@mygyanvihar.com'),
  ('BP504T', 'V', 'LT-25', 2, '10:00'::time, '10:50'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP501T', 'V', 'LT-25', 2, '10:50'::time, '11:40'::time, 'mahendra.saini@mygyanvihar.com'),
  ('BP502T', 'V', 'LT-25', 2, '11:40'::time, '12:30'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP502P', 'V', 'LT-25', 2, '13:30'::time, '16:50'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP504T', 'V', 'LT-25', 3, '09:00'::time, '10:00'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP501T', 'V', 'LT-25', 3, '10:00'::time, '10:50'::time, 'mahendra.saini@mygyanvihar.com'),
  ('BP505T', 'V', 'LT-25', 3, '10:50'::time, '11:40'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP502T', 'V', 'LT-25', 3, '13:30'::time, '14:20'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP502T', 'V', 'LT-25', 4, '09:00'::time, '10:00'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP503T', 'V', 'LT-25', 4, '10:00'::time, '10:50'::time, 'mahendra.saini@mygyanvihar.com'),
  ('BP504T', 'V', 'LT-25', 4, '11:40'::time, '12:30'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP502P', 'V', 'LT-25', 4, '13:30'::time, '16:50'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP503P', 'V', 'LT-25', 4, '13:30'::time, '16:50'::time, 'mahendra.saini@mygyanvihar.com'),
  ('BP504P', 'V', 'LT-25', 4, '13:30'::time, '16:50'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP503T', 'V', 'LT-25', 5, '09:00'::time, '10:00'::time, 'mahendra.saini@mygyanvihar.com'),
  ('BP501T', 'V', 'LT-25', 5, '10:00'::time, '10:50'::time, 'mahendra.saini@mygyanvihar.com'),
  ('BP505T', 'V', 'LT-25', 5, '10:50'::time, '11:40'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP504P', 'V', 'LT-25', 5, '13:30'::time, '16:50'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP503P', 'V', 'LT-25', 5, '13:30'::time, '16:50'::time, 'mahendra.saini@mygyanvihar.com'),
  ('BP503T', 'V', 'LT-25', 6, '09:00'::time, '10:00'::time, 'mahendra.saini@mygyanvihar.com'),
  ('BP504T', 'V', 'LT-25', 6, '10:00'::time, '10:50'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP505T', 'V', 'LT-25', 6, '10:50'::time, '11:40'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP701T', 'VII', 'LT-26', 1, '09:00'::time, '10:00'::time, 'mahendra.saini@mygyanvihar.com'),
  ('BP702T', 'VII', 'LT-26', 1, '10:00'::time, '10:50'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP706PS', 'VII', 'LT-26', 1, '13:30'::time, '16:50'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP703T', 'VII', 'LT-26', 2, '09:00'::time, '10:00'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP701T', 'VII', 'LT-26', 2, '10:00'::time, '10:50'::time, 'mahendra.saini@mygyanvihar.com'),
  ('BP702T', 'VII', 'LT-26', 2, '10:50'::time, '11:40'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP703T', 'VII', 'LT-26', 2, '11:40'::time, '12:30'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP702P', 'VII', 'LT-26', 2, '13:30'::time, '16:50'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP701T', 'VII', 'LT-26', 3, '09:00'::time, '10:00'::time, 'mahendra.saini@mygyanvihar.com'),
  ('BP703T', 'VII', 'LT-26', 3, '10:00'::time, '10:50'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP704T', 'VII', 'LT-26', 3, '10:50'::time, '11:40'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP704T', 'VII', 'LT-26', 3, '13:30'::time, '14:20'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP704T', 'VII', 'LT-26', 4, '09:00'::time, '10:00'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP702T', 'VII', 'LT-26', 4, '10:00'::time, '10:50'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP703T', 'VII', 'LT-26', 4, '10:50'::time, '11:40'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP702P', 'VII', 'LT-26', 4, '13:30'::time, '16:50'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP704T', 'VII', 'LT-26', 5, '09:00'::time, '10:00'::time, 'manish1.gupta@mygyanvihar.com'),
  ('BP702T', 'VII', 'LT-26', 5, '10:00'::time, '10:50'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP702P', 'VII', 'LT-26', 5, '13:30'::time, '16:50'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP702T', 'VII', 'LT-26', 6, '09:00'::time, '10:00'::time, 'amit.kaushik@mygyanvihar.com'),
  ('BP701T', 'VII', 'LT-26', 6, '10:50'::time, '11:40'::time, 'mahendra.saini@mygyanvihar.com')
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
JOIN users u ON lower(u.official_email) = lower(s.faculty_email)
CROSS JOIN tenant t
ON CONFLICT (tenant_id, course_id, day_of_week, start_time, end_time)
WHERE deleted_at IS NULL
DO UPDATE SET
  room = EXCLUDED.room,
  faculty_user_id = EXCLUDED.faculty_user_id;

-- ---------------------------------------------------------------------------
-- 6. Student course enrollments (Pharmacy sem 3/5/7 only)
-- ---------------------------------------------------------------------------
WITH pharmacy_students AS (
  SELECT u.user_id, sp.tenant_id, sp.current_semester, sp.section_code, sp.batch
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = 'Pharmacy'
  WHERE sp.current_semester IN (3, 5, 7)
    AND sp.batch = 'B.Pharm'
),
matching_allocations AS (
  SELECT
    s.user_id,
    s.tenant_id,
    s.current_semester,
    s.section_code,
    a.course_id
  FROM pharmacy_students s
  JOIN academic_course_allocations a ON a.tenant_id = s.tenant_id
  WHERE a.academic_year = '2026-2027'
    AND a.status = 'ACTIVE'
    AND a.course_id IS NOT NULL
    AND upper(replace(COALESCE(a.program_name, ''), ' ', '')) = upper(replace(COALESCE(s.batch, 'B.Pharm'), ' ', ''))
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
-- 7. Faculty mentorships (one mentor per semester cohort)
-- ---------------------------------------------------------------------------
WITH mentor_map AS (
  SELECT * FROM (VALUES
  (3, 'mahendra.saini@mygyanvihar.com'),
  (5, 'manish1.gupta@mygyanvihar.com'),
  (7, 'amit.kaushik@mygyanvihar.com')
  ) AS m(semester_num, mentor_email)
),
pharmacy_students AS (
  SELECT u.user_id, sp.current_semester
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = 'Pharmacy'
  WHERE sp.batch = 'B.Pharm' AND sp.current_semester IN (3, 5, 7)
)
INSERT INTO academic_mentorships (student_user_id, proctor_user_id, is_active)
SELECT ps.user_id, mentor.user_id, true
FROM pharmacy_students ps
JOIN mentor_map mm ON mm.semester_num = ps.current_semester
JOIN users mentor ON lower(mentor.official_email) = lower(mm.mentor_email)
ON CONFLICT (student_user_id) DO UPDATE SET
  proctor_user_id = EXCLUDED.proctor_user_id,
  is_active = true,
  updated_at = NOW();

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'academics.pharmacy_timetable',
  'Student / Faculty / HOD',
  'lakshya.2548727@mygyanvihar.com',
  'Pharmacy timetable & workload',
  'B.Pharm Sem III/V/VII — 17 students, 3 faculty, HOD Hitesh',
  'Source: pharmacy_TT.pdf + Pharmacy_Faculty_Workload_JULY -DEC. 2026.xlsx'
)
ON CONFLICT (smoke_key) DO UPDATE SET
  sample_record = EXCLUDED.sample_record,
  notes = EXCLUDED.notes,
  seeded_at = NOW();

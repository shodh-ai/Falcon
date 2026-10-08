-- B.Tech ME timetable + workload seed (Sem III / V / VII Batch A)
-- Source: B.Tech (ME) Updated Time Table.pdf + faculty TT (Amit, Himanshu, Neeraj, Raj)
-- Faculty scope: Amit Tiwari, Himanshu Vasnani, Neeraj Kumar (HOD), Raj Kumar

-- ---------------------------------------------------------------------------
-- 1. HOD hierarchy
-- ---------------------------------------------------------------------------
UPDATE departments d
SET hod_user_id = u.user_id, updated_at = NOW()
FROM users u
WHERE d.dept_name = 'Mech Engg'
  AND lower(u.official_email) = lower('neeraj.kumar1@mygyanvihar.com');

UPDATE users u
SET reporting_officer_id = hod.user_id, updated_at = NOW()
FROM users hod
WHERE lower(hod.official_email) = lower('neeraj.kumar1@mygyanvihar.com')
  AND lower(u.official_email) IN (
    'amit.tiwari@mygyanvihar.com',
    'himanshu.vasnani@mygyanvihar.com',
    'raj.kumar@mygyanvihar.com'
  );

-- ---------------------------------------------------------------------------
-- 2. ME student profiles (Batch A, sem 3/5/7)
-- ---------------------------------------------------------------------------
UPDATE student_profiles sp
SET
  current_semester = v.sem,
  batch = 'B.Tech ME',
  section_code = v.section_code,
  updated_at = NOW()
FROM users u
JOIN (VALUES
  ('anshuman.2549873@mygyanvihar.com', 3, 'A'),
  ('jalaj.2550454@mygyanvihar.com', 3, 'A'),
  ('sunil.2455672@mygyanvihar.com', 5, 'A'),
  ('raviraj.2455903@mygyanvihar.com', 5, 'A'),
  ('yash.23180717@mygyanvihar.com', 7, 'A'),
  ('ravi.2345541@mygyanvihar.com', 7, 'A')
) AS v(email, sem, section_code) ON lower(u.official_email) = lower(v.email)
JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = 'Mech Engg'
WHERE sp.user_id = u.user_id;

-- ---------------------------------------------------------------------------
-- 3. B.Tech ME program + subjects + courses
-- ---------------------------------------------------------------------------
INSERT INTO iam_programs (program_name, program_code, duration_years)
SELECT 'B.Tech ME', 'BTECH-ME', 4
WHERE NOT EXISTS (
  SELECT 1 FROM iam_programs WHERE upper(program_code) = 'BTECH-ME' AND deleted_at IS NULL
);

WITH prog AS (
  SELECT program_id FROM iam_programs
  WHERE upper(program_code) = 'BTECH-ME' AND deleted_at IS NULL
  LIMIT 1
)
INSERT INTO academic_subjects (subject_code, subject_name, subject_shortname, program_id, credits, subject_type, is_active)
SELECT v.subject_code, v.subject_name, v.subject_shortname, p.program_id, v.credits, v.subject_type, true
FROM prog p
CROSS JOIN (VALUES
  ('AE3001', 'AE3001', 'AE3001', 4, 'THEORY'),
  ('DHS231', 'DHS231', 'DHS231', 4, 'THEORY'),
  ('DME307', 'DME307', 'DME307', 4, 'THEORY'),
  ('DME321', 'DME321', 'DME321', 4, 'THEORY'),
  ('EM301', 'Employability Skill-III', 'EM301', 4, 'THEORY'),
  ('EM401', 'Group Discussion, Aptitude & Reasoning- I', 'EM401', 4, 'THEORY'),
  ('ME215', 'ME215', 'ME215', 4, 'THEORY'),
  ('ME3001', 'Mechanics of Solids', 'ME3001', 4, 'THEORY'),
  ('ME3002', 'Engineering Thermodynamics', 'ME3002', 4, 'THEORY'),
  ('ME3003', 'Applied Material Science', 'ME3003', 4, 'THEORY'),
  ('ME3004', 'Manufacturing Technology', 'ME3004', 4, 'THEORY'),
  ('ME3005', 'Industrial Engineering', 'ME3005', 4, 'THEORY'),
  ('ME301', 'Machining Science and Machine Tools', 'ME301', 4, 'THEORY'),
  ('ME303', 'Mechanical Vibration Engineering', 'ME303', 4, 'THEORY'),
  ('ME305', 'Heat & Mass Transfer', 'ME305', 4, 'THEORY'),
  ('ME313', 'Micro Electro & Mechanical Systems (MEMS) and Microsystems', 'ME313', 4, 'THEORY'),
  ('ME351', 'Production Process Lab', 'ME351', 2, 'LAB'),
  ('ME353', 'Mechanical Vibration Lab', 'ME353', 2, 'LAB'),
  ('ME355', 'Heat & Mass Transfer Lab', 'ME355', 2, 'LAB'),
  ('ME3701', 'Mechanics of Solid Lab', 'ME3701', 2, 'LAB'),
  ('ME3702', 'Thermal Engineering Lab', 'ME3702', 2, 'LAB'),
  ('ME3703', 'Material Science Lab', 'ME3703', 2, 'LAB'),
  ('ME3704', 'Manufacturing Technology Lab', 'ME3704', 2, 'LAB'),
  ('ME3705', 'Programming Using MATLAB', 'ME3705', 2, 'LAB'),
  ('ME405', 'CAD, CAM & CIM', 'ME405', 4, 'THEORY'),
  ('ME407', 'Renewable Energy Technology', 'ME407', 4, 'THEORY'),
  ('ME411', 'Robotics Engineering', 'ME411', 4, 'THEORY'),
  ('ME453', 'CNC Machines and Programming Lab', 'ME453', 2, 'LAB'),
  ('PE403', 'Major Project', 'PE403', 2, 'LAB'),
  ('PT303', 'Industrial Training Seminar', 'PT303', 2, 'LAB'),
  ('SM401', 'Seminar', 'SM401', 2, 'LAB'),
  ('UC201', 'UC201', 'UC201', 4, 'THEORY'),
  ('UC3002', 'Economics and Social Sciences', 'UC3002', 4, 'THEORY'),
  ('UC351', 'Field Project/Field Visit-5', 'UC351', 2, 'LAB'),
  ('UC401', 'Intellectual Property Rights', 'UC401', 4, 'THEORY'),
  ('UCEEPI', 'Election and Electoral Processes in India', 'UCEEPI', 4, 'THEORY'),
  ('UCFV1', 'Field Visit-I', 'UCFV1', 2, 'LAB'),
  ('UCTION', 'UCTION', 'UCTION', 4, 'THEORY')
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
  SELECT subject_id, subject_code, subject_name, credits, subject_type
  FROM academic_subjects
  WHERE subject_code IN ('AE3001', 'DHS231', 'DME307', 'DME321', 'EM301', 'EM401', 'ME215', 'ME3001', 'ME3002', 'ME3003', 'ME3004', 'ME3005', 'ME301', 'ME303', 'ME305', 'ME313', 'ME351', 'ME353', 'ME355', 'ME3701', 'ME3702', 'ME3703', 'ME3704', 'ME3705', 'ME405', 'ME407', 'ME411', 'ME453', 'PE403', 'PT303', 'SM401', 'UC201', 'UC3002', 'UC351', 'UC401', 'UCEEPI', 'UCFV1', 'UCTION')
)
INSERT INTO academic_courses (tenant_id, course_code, course_name, credits, is_elective, course_type)
SELECT
  t.tenant_id,
  s.subject_code,
  s.subject_name,
  s.credits,
  false,
  CASE WHEN s.subject_type = 'LAB' THEN 'LAB' ELSE 'CORE' END
FROM tenant t
CROSS JOIN subject_rows s
ON CONFLICT (tenant_id, course_code) DO UPDATE SET
  course_name = EXCLUDED.course_name,
  credits = EXCLUDED.credits,
  course_type = EXCLUDED.course_type;

-- ---------------------------------------------------------------------------
-- 4. Course allocations
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
  ('ME3002', 'B.Tech ME', 'III-A', 'neeraj.kumar1@mygyanvihar.com'),
  ('ME3703', 'B.Tech ME', 'III-A', 'amit.tiwari@mygyanvihar.com'),
  ('ME3003', 'B.Tech ME', 'III-A', 'amit.tiwari@mygyanvihar.com'),
  ('ME3702', 'B.Tech ME', 'III-A', 'himanshu.vasnani@mygyanvihar.com'),
  ('ME3005', 'B.Tech ME', 'III-A', 'himanshu.vasnani@mygyanvihar.com'),
  ('ME3704', 'B.Tech ME', 'III-A', 'raj.kumar@mygyanvihar.com'),
  ('ME3001', 'B.Tech ME', 'III-A', 'neeraj.kumar1@mygyanvihar.com'),
  ('ME3705', 'B.Tech ME', 'III-A', 'amit.tiwari@mygyanvihar.com'),
  ('ME3004', 'B.Tech ME', 'III-A', 'raj.kumar@mygyanvihar.com'),
  ('ME3701', 'B.Tech ME', 'III-A', 'neeraj.kumar1@mygyanvihar.com'),
  ('UC3002', 'B.Tech ME', 'III-A', 'raj.kumar@mygyanvihar.com'),
  ('UCFV1', 'B.Tech ME', 'III-A', 'himanshu.vasnani@mygyanvihar.com'),
  ('UCEEPI', 'B.Tech ME', 'III-A', 'neeraj.kumar1@mygyanvihar.com'),
  ('ME305', 'B.Tech ME', 'V-A', 'neeraj.kumar1@mygyanvihar.com'),
  ('ME351', 'B.Tech ME', 'V-A', 'amit.tiwari@mygyanvihar.com'),
  ('ME303', 'B.Tech ME', 'V-A', 'neeraj.kumar1@mygyanvihar.com'),
  ('PT303', 'B.Tech ME', 'V-A', 'neeraj.kumar1@mygyanvihar.com'),
  ('ME301', 'B.Tech ME', 'V-A', 'amit.tiwari@mygyanvihar.com'),
  ('UC351', 'B.Tech ME', 'V-A', 'himanshu.vasnani@mygyanvihar.com'),
  ('ME313', 'B.Tech ME', 'V-A', 'neeraj.kumar1@mygyanvihar.com'),
  ('ME355', 'B.Tech ME', 'V-A', 'raj.kumar@mygyanvihar.com'),
  ('EM301', 'B.Tech ME', 'V-A', 'neeraj.kumar1@mygyanvihar.com'),
  ('ME353', 'B.Tech ME', 'V-A', 'neeraj.kumar1@mygyanvihar.com'),
  ('ME405', 'B.Tech ME', 'VII-A', 'neeraj.kumar1@mygyanvihar.com'),
  ('SM401', 'B.Tech ME', 'VII-A', 'himanshu.vasnani@mygyanvihar.com'),
  ('ME407', 'B.Tech ME', 'VII-A', 'himanshu.vasnani@mygyanvihar.com'),
  ('PE403', 'B.Tech ME', 'VII-A', 'amit.tiwari@mygyanvihar.com'),
  ('ME411', 'B.Tech ME', 'VII-A', 'raj.kumar@mygyanvihar.com'),
  ('ME453', 'B.Tech ME', 'VII-A', 'neeraj.kumar1@mygyanvihar.com'),
  ('UC401', 'B.Tech ME', 'VII-A', 'amit.tiwari@mygyanvihar.com'),
  ('EM401', 'B.Tech ME', 'VII-A', 'himanshu.vasnani@mygyanvihar.com'),
  ('ME215', 'B.Tech ME', 'V-A', 'himanshu.vasnani@mygyanvihar.com'),
  ('UCTION', 'B.Tech ME', 'V-A', 'amit.tiwari@mygyanvihar.com'),
  ('AE3001', 'B.Tech ME', 'V-A', 'raj.kumar@mygyanvihar.com'),
  ('UC201', 'B.Tech ME', 'V-A', 'raj.kumar@mygyanvihar.com'),
  ('DME307', 'B.Tech ME', 'V-A', 'raj.kumar@mygyanvihar.com'),
  ('DHS231', 'B.Tech ME', 'V-A', 'raj.kumar@mygyanvihar.com'),
  ('DME321', 'B.Tech ME', 'V-A', 'raj.kumar@mygyanvihar.com')
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
-- 5. Timetable slots (student grid + faculty individual TT)
-- ---------------------------------------------------------------------------
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
course_rows AS (
  SELECT course_id, course_code FROM academic_courses
),
slot_rows AS (
  SELECT * FROM (VALUES
  ('ME3002', 'III-A', 'LT-14', 'A', 1, '10:00'::time, '10:50'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME3001', 'III-A', 'LT-14', 'A', 1, '10:50'::time, '11:40'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME3004', 'III-A', 'LT-14', 'A', 1, '11:40'::time, '12:30'::time, 'raj.kumar@mygyanvihar.com'),
  ('ME3701', 'III-A', 'LT-14', 'A', 1, '13:30'::time, '14:20'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME3005', 'III-A', 'LT-14', 'A', 2, '09:00'::time, '10:00'::time, 'himanshu.vasnani@mygyanvihar.com'),
  ('ME3001', 'III-A', 'LT-14', 'A', 2, '10:00'::time, '10:50'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('UC201', 'III-A', 'LT-14', 'A', 2, '10:50'::time, '11:40'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME3002', 'III-A', 'LT-14', 'A', 2, '11:40'::time, '12:30'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME3702', 'III-A', 'LT-14', 'A', 2, '13:30'::time, '14:20'::time, 'himanshu.vasnani@mygyanvihar.com'),
  ('ME3005', 'III-A', 'LT-14', 'A', 3, '09:00'::time, '10:00'::time, 'himanshu.vasnani@mygyanvihar.com'),
  ('ME3002', 'III-A', 'LT-14', 'A', 3, '10:00'::time, '10:50'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME3003', 'III-A', 'LT-14', 'A', 3, '10:50'::time, '11:40'::time, 'amit.tiwari@mygyanvihar.com'),
  ('ME3001', 'III-A', 'LT-14', 'A', 3, '11:40'::time, '12:30'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME3004', 'III-A', 'LT-14', 'A', 3, '13:30'::time, '14:20'::time, 'raj.kumar@mygyanvihar.com'),
  ('ME3003', 'III-A', 'LT-14', 'A', 4, '09:00'::time, '10:00'::time, 'amit.tiwari@mygyanvihar.com'),
  ('ME3002', 'III-A', 'LT-14', 'A', 4, '10:00'::time, '10:50'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME3705', 'III-A', 'LT-14', 'A', 4, '10:50'::time, '11:40'::time, 'amit.tiwari@mygyanvihar.com'),
  ('UC201', 'III-A', 'LT-14', 'A', 4, '13:30'::time, '14:20'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME3704', 'III-A', 'LT-14', 'A', 4, '14:20'::time, '15:10'::time, 'raj.kumar@mygyanvihar.com'),
  ('ME3003', 'III-A', 'LT-14', 'A', 5, '10:00'::time, '10:50'::time, 'amit.tiwari@mygyanvihar.com'),
  ('ME3004', 'III-A', 'LT-14', 'A', 5, '10:50'::time, '11:40'::time, 'raj.kumar@mygyanvihar.com'),
  ('UC201', 'III-A', 'LT-14', 'A', 5, '11:40'::time, '12:30'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME3703', 'III-A', 'LT-14', 'A', 5, '13:30'::time, '14:20'::time, 'amit.tiwari@mygyanvihar.com'),
  ('ME3005', 'III-A', 'LT-14', 'A', 6, '09:00'::time, '10:00'::time, 'himanshu.vasnani@mygyanvihar.com'),
  ('ME303', 'V-A', 'ME Computer Lab', 'A', 1, '10:50'::time, '11:40'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME355', 'V-A', 'ME Computer Lab', 'A', 1, '13:30'::time, '14:20'::time, 'raj.kumar@mygyanvihar.com'),
  ('ME303', 'V-A', 'ME Computer Lab', 'A', 2, '09:00'::time, '10:00'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME301', 'V-A', 'ME Computer Lab', 'A', 2, '10:00'::time, '10:50'::time, 'amit.tiwari@mygyanvihar.com'),
  ('ME305', 'V-A', 'ME Computer Lab', 'A', 2, '10:50'::time, '11:40'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME305', 'V-A', 'ME Computer Lab', 'A', 3, '09:00'::time, '10:00'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME301', 'V-A', 'ME Computer Lab', 'A', 3, '10:00'::time, '10:50'::time, 'amit.tiwari@mygyanvihar.com'),
  ('ME305', 'V-A', 'ME Computer Lab', 'A', 3, '10:50'::time, '11:40'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME303', 'V-A', 'ME Computer Lab', 'A', 3, '13:30'::time, '14:20'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME303', 'V-A', 'ME Computer Lab', 'A', 4, '09:00'::time, '10:00'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME301', 'V-A', 'ME Computer Lab', 'A', 4, '10:00'::time, '10:50'::time, 'amit.tiwari@mygyanvihar.com'),
  ('UCTION', 'V-A', 'ME Computer Lab', 'A', 4, '13:30'::time, '14:20'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME301', 'V-A', 'ME Computer Lab', 'A', 5, '09:00'::time, '10:00'::time, 'amit.tiwari@mygyanvihar.com'),
  ('ME353', 'V-A', 'ME Computer Lab', 'A', 5, '10:50'::time, '11:40'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME305', 'V-A', 'ME Computer Lab', 'A', 6, '10:00'::time, '10:50'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME405', 'VII-A', 'Old Computer Lab', 'A', 1, '10:00'::time, '10:50'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('UC401', 'VII-A', 'Old Computer Lab', 'A', 1, '10:50'::time, '11:40'::time, 'amit.tiwari@mygyanvihar.com'),
  ('ME407', 'VII-A', 'Old Computer Lab', 'A', 1, '11:40'::time, '12:30'::time, 'himanshu.vasnani@mygyanvihar.com'),
  ('ME405', 'VII-A', 'Old Computer Lab', 'A', 2, '09:00'::time, '10:00'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME407', 'VII-A', 'Old Computer Lab', 'A', 2, '10:50'::time, '11:40'::time, 'himanshu.vasnani@mygyanvihar.com'),
  ('EM401', 'VII-A', 'Old Computer Lab', 'A', 2, '11:40'::time, '12:30'::time, 'himanshu.vasnani@mygyanvihar.com'),
  ('ME411', 'VII-A', 'Old Computer Lab', 'A', 3, '09:00'::time, '10:00'::time, 'raj.kumar@mygyanvihar.com'),
  ('ME407', 'VII-A', 'Old Computer Lab', 'A', 3, '10:00'::time, '10:50'::time, 'himanshu.vasnani@mygyanvihar.com'),
  ('UC401', 'VII-A', 'Old Computer Lab', 'A', 3, '11:40'::time, '12:30'::time, 'amit.tiwari@mygyanvihar.com'),
  ('ME405', 'VII-A', 'Old Computer Lab', 'A', 3, '13:30'::time, '14:20'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME405', 'VII-A', 'Old Computer Lab', 'A', 4, '09:00'::time, '10:00'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('EM401', 'VII-A', 'Old Computer Lab', 'A', 4, '10:00'::time, '10:50'::time, 'himanshu.vasnani@mygyanvihar.com'),
  ('ME411', 'VII-A', 'Old Computer Lab', 'A', 4, '10:50'::time, '11:40'::time, 'raj.kumar@mygyanvihar.com'),
  ('ME411', 'VII-A', 'Old Computer Lab', 'A', 5, '09:00'::time, '10:00'::time, 'raj.kumar@mygyanvihar.com'),
  ('ME453', 'VII-A', 'Old Computer Lab', 'A', 5, '10:50'::time, '11:40'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('UC401', 'VII-A', 'Old Computer Lab', 'A', 6, '09:00'::time, '10:00'::time, 'amit.tiwari@mygyanvihar.com'),
  ('ME3005', 'III-A', 'ME Faculty Room', 'A', 2, '09:10'::time, '10:00'::time, 'himanshu.vasnani@mygyanvihar.com'),
  ('ME3705', 'III-A', 'ME Faculty Room', 'A', 2, '01:30'::time, '02:20'::time, 'himanshu.vasnani@mygyanvihar.com'),
  ('ME3005', 'III-A', 'ME Faculty Room', 'A', 3, '09:10'::time, '10:00'::time, 'himanshu.vasnani@mygyanvihar.com'),
  ('ME215', 'V-A', 'ME Faculty Room', 'A', 4, '11:40'::time, '12:30'::time, 'himanshu.vasnani@mygyanvihar.com'),
  ('SM401', 'VII-A', 'ME Faculty Room', 'A', 5, '01:30'::time, '02:20'::time, 'himanshu.vasnani@mygyanvihar.com'),
  ('ME3005', 'III-A', 'ME Faculty Room', 'A', 6, '09:10'::time, '10:00'::time, 'himanshu.vasnani@mygyanvihar.com'),
  ('ME303', 'III-A', 'ME Faculty Room', 'A', 2, '09:10'::time, '10:00'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME305', 'III-A', 'ME Faculty Room', 'A', 3, '09:10'::time, '10:00'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME303', 'III-A', 'ME Faculty Room', 'A', 3, '01:30'::time, '02:20'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME303', 'III-A', 'ME Faculty Room', 'A', 4, '09:10'::time, '10:00'::time, 'neeraj.kumar1@mygyanvihar.com'),
  ('ME3003', 'III-A', 'ME Faculty Room', 'A', 4, '09:10'::time, '10:00'::time, 'amit.tiwari@mygyanvihar.com'),
  ('ME3705', 'III-A', 'ME Faculty Room', 'A', 4, '11:40'::time, '12:30'::time, 'amit.tiwari@mygyanvihar.com'),
  ('UCTION', 'V-A', 'ME Faculty Room', 'A', 4, '01:30'::time, '02:20'::time, 'amit.tiwari@mygyanvihar.com'),
  ('UCTION', 'V-A', 'ME Faculty Room', 'A', 4, '02:20'::time, '03:10'::time, 'amit.tiwari@mygyanvihar.com'),
  ('ME301', 'III-A', 'ME Faculty Room', 'A', 5, '09:10'::time, '10:00'::time, 'amit.tiwari@mygyanvihar.com'),
  ('ME3703', 'III-A', 'ME Faculty Room', 'A', 5, '01:30'::time, '02:20'::time, 'amit.tiwari@mygyanvihar.com'),
  ('ME3703', 'III-A', 'ME Faculty Room', 'A', 5, '02:20'::time, '03:10'::time, 'amit.tiwari@mygyanvihar.com'),
  ('UC401', 'VII-A', 'ME Faculty Room', 'A', 6, '09:10'::time, '10:00'::time, 'amit.tiwari@mygyanvihar.com'),
  ('AE3001', 'V-A', 'ME Faculty Room', 'A', 1, '10:00'::time, '10:50'::time, 'raj.kumar@mygyanvihar.com'),
  ('ME355', 'III-A', 'ME Faculty Room', 'A', 1, '01:30'::time, '02:20'::time, 'raj.kumar@mygyanvihar.com'),
  ('ME355', 'III-A', 'ME Faculty Room', 'A', 1, '02:20'::time, '03:10'::time, 'raj.kumar@mygyanvihar.com'),
  ('AE3001', 'V-A', 'ME Faculty Room', 'A', 2, '09:10'::time, '10:00'::time, 'raj.kumar@mygyanvihar.com'),
  ('UC201', 'V-A', 'ME Faculty Room', 'A', 2, '10:00'::time, '10:50'::time, 'raj.kumar@mygyanvihar.com'),
  ('DME307', 'V-A', 'ME Faculty Room', 'A', 2, '10:50'::time, '11:40'::time, 'raj.kumar@mygyanvihar.com'),
  ('DHS231', 'V-A', 'ME Faculty Room', 'A', 2, '10:50'::time, '11:40'::time, 'raj.kumar@mygyanvihar.com'),
  ('DHS231', 'V-A', 'ME Faculty Room', 'A', 2, '11:40'::time, '12:30'::time, 'raj.kumar@mygyanvihar.com'),
  ('ME411', 'VII-A', 'ME Faculty Room', 'A', 3, '09:10'::time, '10:00'::time, 'raj.kumar@mygyanvihar.com'),
  ('AE3001', 'V-A', 'ME Faculty Room', 'A', 3, '10:00'::time, '10:50'::time, 'raj.kumar@mygyanvihar.com'),
  ('AE3001', 'V-A', 'ME Faculty Room', 'A', 3, '10:50'::time, '11:40'::time, 'raj.kumar@mygyanvihar.com'),
  ('DME307', 'V-A', 'ME Faculty Room', 'A', 3, '10:50'::time, '11:40'::time, 'raj.kumar@mygyanvihar.com'),
  ('DHS231', 'V-A', 'ME Faculty Room', 'A', 3, '11:40'::time, '12:30'::time, 'raj.kumar@mygyanvihar.com'),
  ('ME3004', 'III-A', 'ME Faculty Room', 'A', 3, '01:30'::time, '02:20'::time, 'raj.kumar@mygyanvihar.com'),
  ('DME321', 'V-A', 'ME Faculty Room', 'A', 4, '09:10'::time, '10:00'::time, 'raj.kumar@mygyanvihar.com'),
  ('DME321', 'V-A', 'ME Faculty Room', 'A', 4, '10:00'::time, '10:50'::time, 'raj.kumar@mygyanvihar.com'),
  ('DME321', 'V-A', 'ME Faculty Room', 'A', 4, '10:50'::time, '11:40'::time, 'raj.kumar@mygyanvihar.com'),
  ('DHS231', 'V-A', 'ME Faculty Room', 'A', 4, '11:40'::time, '12:30'::time, 'raj.kumar@mygyanvihar.com'),
  ('UC201', 'V-A', 'ME Faculty Room', 'A', 4, '01:30'::time, '02:20'::time, 'raj.kumar@mygyanvihar.com'),
  ('ME3704', 'III-A', 'ME Faculty Room', 'A', 4, '02:20'::time, '03:10'::time, 'raj.kumar@mygyanvihar.com'),
  ('ME3704', 'III-A', 'ME Faculty Room', 'A', 4, '03:10'::time, '04:00'::time, 'raj.kumar@mygyanvihar.com'),
  ('ME411', 'VII-A', 'ME Faculty Room', 'A', 5, '09:10'::time, '10:00'::time, 'raj.kumar@mygyanvihar.com'),
  ('UC201', 'V-A', 'ME Faculty Room', 'A', 5, '10:50'::time, '11:40'::time, 'raj.kumar@mygyanvihar.com'),
  ('DME307', 'V-A', 'ME Faculty Room', 'A', 6, '09:10'::time, '10:00'::time, 'raj.kumar@mygyanvihar.com')
  ) AS s(course_code, semester, room, section, day_of_week, start_time, end_time, faculty_email)
)
INSERT INTO academic_timetables (tenant_id, course_id, day_of_week, start_time, end_time, room, faculty_user_id, section)
SELECT
  t.tenant_id,
  c.course_id,
  s.day_of_week,
  s.start_time,
  s.end_time,
  s.room,
  u.user_id,
  s.section
FROM slot_rows s
JOIN course_rows c ON c.course_code = s.course_code
JOIN users u ON lower(u.official_email) = lower(s.faculty_email)
CROSS JOIN tenant t
ON CONFLICT (tenant_id, course_id, day_of_week, start_time, end_time)
WHERE deleted_at IS NULL
DO UPDATE SET
  room = EXCLUDED.room,
  faculty_user_id = EXCLUDED.faculty_user_id,
  section = EXCLUDED.section;

-- ---------------------------------------------------------------------------
-- 6. Student course enrollments (ME sem 3/5/7 Batch A)
-- ---------------------------------------------------------------------------
WITH me_students AS (
  SELECT u.user_id, sp.tenant_id, sp.current_semester, sp.section_code, sp.batch
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = 'Mech Engg'
  WHERE sp.current_semester IN (3, 5, 7)
    AND sp.batch = 'B.Tech ME'
    AND sp.section_code = 'A'
),
matching_allocations AS (
  SELECT
    s.user_id,
    s.tenant_id,
    s.current_semester,
    s.section_code,
    a.course_id
  FROM me_students s
  JOIN academic_course_allocations a ON a.tenant_id = s.tenant_id
  WHERE a.academic_year = '2026-2027'
    AND a.status = 'ACTIVE'
    AND a.course_id IS NOT NULL
    AND upper(replace(COALESCE(a.program_name, ''), ' ', '')) = upper(replace('B.Tech ME', ' ', ''))
    AND (
      s.section_code IS NULL
      OR upper(split_part(COALESCE(a.semester, ''), '-', 2)) = upper(s.section_code)
      OR split_part(COALESCE(a.semester, ''), '-', 2) = ''
    )
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
-- 7. Faculty mentorships
-- ---------------------------------------------------------------------------
WITH mentor_map AS (
  SELECT * FROM (VALUES
  (3, 'neeraj.kumar1@mygyanvihar.com'),
  (5, 'amit.tiwari@mygyanvihar.com'),
  (7, 'raj.kumar@mygyanvihar.com')
  ) AS m(semester_num, mentor_email)
),
me_students AS (
  SELECT u.user_id, sp.current_semester
  FROM users u
  JOIN student_profiles sp ON sp.user_id = u.user_id
  JOIN departments d ON d.dept_id = u.dept_id AND d.dept_name = 'Mech Engg'
  WHERE sp.batch = 'B.Tech ME' AND sp.current_semester IN (3, 5, 7) AND sp.section_code = 'A'
)
INSERT INTO academic_mentorships (student_user_id, proctor_user_id, is_active)
SELECT ps.user_id, mentor.user_id, true
FROM me_students ps
JOIN mentor_map mm ON mm.semester_num = ps.current_semester
JOIN users mentor ON lower(mentor.official_email) = lower(mm.mentor_email)
ON CONFLICT (student_user_id) DO UPDATE SET
  proctor_user_id = EXCLUDED.proctor_user_id,
  is_active = true,
  updated_at = NOW();

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'academics.me_timetable',
  'Student / Faculty / HOD',
  'anshuman.2549873@mygyanvihar.com',
  'B.Tech ME timetable & workload',
  'B.Tech ME Sem III/V/VII Batch A — 6 students, faculty Amit/Himanshu/Raj, HOD Neeraj',
  'Source: B.Tech (ME) Updated Time Table.pdf + faculty individual TT'
)
ON CONFLICT (smoke_key) DO UPDATE SET
  sample_record = EXCLUDED.sample_record,
  notes = EXCLUDED.notes,
  seeded_at = NOW();

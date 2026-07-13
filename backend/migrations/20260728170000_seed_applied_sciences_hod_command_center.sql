-- Applied Sciences HOD command-center parity with CSE (courses, timetable, syllabus, enrollments).
-- Scoped to Department of Applied Sciences — gaurav.sharma@mygyanvihar.com HOD portal.
-- Password unchanged: password123

DO $$
DECLARE
  v_tenant UUID;
  v_dept INT;
  v_hod UUID;
  v_faculty1 UUID;
  v_faculty2 UUID;
  v_faculty3 UUID;
  v_course1 UUID;
  v_course2 UUID;
  v_course3 UUID;
  v_sub1 INT;
  v_sub2 INT;
  v_sub3 INT;
  v_sub_nf INT;
  v_program INT;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1;
  SELECT dept_id INTO v_dept FROM departments WHERE dept_name = 'Applied Sciences' LIMIT 1;
  SELECT program_id INTO v_program
  FROM iam_programs
  WHERE dept_id = v_dept AND deleted_at IS NULL
  ORDER BY program_id
  LIMIT 1;
  IF v_program IS NULL THEN
    SELECT program_id INTO v_program FROM iam_programs WHERE deleted_at IS NULL ORDER BY program_id LIMIT 1;
  END IF;
  SELECT user_id INTO v_hod FROM users WHERE lower(official_email) = 'gaurav.sharma@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_faculty1 FROM users WHERE lower(official_email) = 'reena.saxena@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_faculty2 FROM users WHERE lower(official_email) = 'harshita.laddha@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_faculty3 FROM users WHERE lower(official_email) = 'poonam.patel@mygyanvihar.com' LIMIT 1;

  IF v_tenant IS NULL OR v_dept IS NULL OR v_hod IS NULL THEN
    RAISE NOTICE 'Skipping SAS command center seed: tenant, dept, or HOD missing';
    RETURN;
  END IF;

  -- Subjects
  INSERT INTO academic_subjects (subject_code, subject_name, subject_shortname, program_id, credits, subject_type, is_active)
  VALUES
    ('SAS101', 'Applied Physics', 'APH', v_program, 4, 'THEORY', true),
    ('SAS201', 'Applied Chemistry', 'ACH', v_program, 4, 'THEORY', true),
    ('SAS301', 'Applied Mathematics', 'AMT', v_program, 4, 'THEORY', true),
    ('SAS401', 'Environmental Science', 'ENV', v_program, 3, 'THEORY', true)
  ON CONFLICT (subject_code) DO UPDATE SET
    subject_name = EXCLUDED.subject_name,
    subject_shortname = EXCLUDED.subject_shortname,
    program_id = EXCLUDED.program_id,
    credits = EXCLUDED.credits,
    is_active = true,
    updated_at = NOW();

  SELECT subject_id INTO v_sub1 FROM academic_subjects WHERE subject_code = 'SAS101' LIMIT 1;
  SELECT subject_id INTO v_sub2 FROM academic_subjects WHERE subject_code = 'SAS201' LIMIT 1;
  SELECT subject_id INTO v_sub3 FROM academic_subjects WHERE subject_code = 'SAS301' LIMIT 1;
  SELECT subject_id INTO v_sub_nf FROM academic_subjects WHERE subject_code = 'SAS401' LIMIT 1;

  -- Courses
  INSERT INTO academic_courses (tenant_id, course_code, course_name, credits, is_elective)
  VALUES
    (v_tenant, 'SAS101', 'Applied Physics', 4, false),
    (v_tenant, 'SAS201', 'Applied Chemistry', 4, false),
    (v_tenant, 'SAS301', 'Applied Mathematics', 4, false),
    (v_tenant, 'SAS401', 'Environmental Science', 3, false)
  ON CONFLICT (tenant_id, course_code) DO UPDATE SET
    course_name = EXCLUDED.course_name,
    credits = EXCLUDED.credits;

  SELECT course_id INTO v_course1 FROM academic_courses WHERE tenant_id = v_tenant AND course_code = 'SAS101' LIMIT 1;
  SELECT course_id INTO v_course2 FROM academic_courses WHERE tenant_id = v_tenant AND course_code = 'SAS201' LIMIT 1;
  SELECT course_id INTO v_course3 FROM academic_courses WHERE tenant_id = v_tenant AND course_code = 'SAS301' LIMIT 1;

  -- Allocations (assigned + one unassigned for teaching-load banner)
  INSERT INTO academic_course_allocations (
    tenant_id, subject_id, program_name, semester, faculty_user_id, academic_year, course_id, status
  )
  VALUES
    (v_tenant, v_sub1, 'BSC APPLIED SCIENCES', 'III', v_faculty1, '2026-2027', v_course1, 'ACTIVE'),
    (v_tenant, v_sub2, 'BSC APPLIED SCIENCES', 'III', v_faculty2, '2026-2027', v_course2, 'ACTIVE'),
    (v_tenant, v_sub3, 'BSC APPLIED SCIENCES', 'V', v_faculty3, '2026-2027', v_course3, 'ACTIVE'),
    (v_tenant, v_sub_nf, 'BSC APPLIED SCIENCES', 'V', NULL, '2026-2027', NULL, 'ACTIVE')
  ON CONFLICT (tenant_id, subject_id, program_name, semester, academic_year) DO UPDATE SET
    faculty_user_id = EXCLUDED.faculty_user_id,
    course_id = EXCLUDED.course_id,
    status = 'ACTIVE',
    updated_at = NOW();

  -- Timetable slots (Mon–Sat spread so classes show on most weekdays)
  INSERT INTO academic_timetables (tenant_id, course_id, day_of_week, start_time, end_time, faculty_user_id, room)
  SELECT v_tenant, v_course1, d.dow, '10:00'::time, '11:00'::time, v_faculty1, 'SAS-101'
  FROM (VALUES (1), (3), (5)) AS d(dow)
  WHERE v_course1 IS NOT NULL AND v_faculty1 IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM academic_timetables t
      WHERE t.tenant_id = v_tenant AND t.course_id = v_course1 AND t.day_of_week = d.dow
    );

  INSERT INTO academic_timetables (tenant_id, course_id, day_of_week, start_time, end_time, faculty_user_id, room)
  SELECT v_tenant, v_course2, d.dow, '11:00'::time, '12:00'::time, v_faculty2, 'SAS-102'
  FROM (VALUES (2), (4), (6)) AS d(dow)
  WHERE v_course2 IS NOT NULL AND v_faculty2 IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM academic_timetables t
      WHERE t.tenant_id = v_tenant AND t.course_id = v_course2 AND t.day_of_week = d.dow
    );

  INSERT INTO academic_timetables (tenant_id, course_id, day_of_week, start_time, end_time, faculty_user_id, room)
  SELECT v_tenant, v_course3, d.dow, '14:00'::time, '15:00'::time, v_faculty3, 'SAS-103'
  FROM (VALUES (1), (2), (4)) AS d(dow)
  WHERE v_course3 IS NOT NULL AND v_faculty3 IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM academic_timetables t
      WHERE t.tenant_id = v_tenant AND t.course_id = v_course3 AND t.day_of_week = d.dow
    );

  -- LMS modules for syllabus coverage widget
  IF to_regclass('public.course_modules') IS NOT NULL THEN
    INSERT INTO course_modules (
      tenant_id, course_id, faculty_user_id, module_number, title, description, status,
      planned_completion_date, completed_at
    )
    VALUES
      (v_tenant, v_course1, v_faculty1, 1, 'Mechanics', 'Units 1–2', 'COMPLETED', CURRENT_DATE - 30, NOW() - INTERVAL '20 days'),
      (v_tenant, v_course1, v_faculty1, 2, 'Thermodynamics', 'Units 3–4', 'IN_PROGRESS', CURRENT_DATE - 14, NULL),
      (v_tenant, v_course2, v_faculty2, 1, 'Organic Basics', 'Units 1–2', 'COMPLETED', CURRENT_DATE - 25, NOW() - INTERVAL '15 days'),
      (v_tenant, v_course2, v_faculty2, 2, 'Analytical Methods', 'Units 3–5', 'IN_PROGRESS', CURRENT_DATE - 10, NULL),
      (v_tenant, v_course3, v_faculty3, 1, 'Calculus Review', 'Units 1–3', 'IN_PROGRESS', CURRENT_DATE - 20, NULL)
    ON CONFLICT (course_id, module_number) DO UPDATE SET
      faculty_user_id = EXCLUDED.faculty_user_id,
      title = EXCLUDED.title,
      status = EXCLUDED.status,
      planned_completion_date = EXCLUDED.planned_completion_date,
      completed_at = EXCLUDED.completed_at,
      updated_at = NOW();
  END IF;

  -- Student enrollments with low attendance for red-flag widget
  IF to_regclass('public.student_course_enrollments') IS NOT NULL THEN
    INSERT INTO student_course_enrollments (
      tenant_id, student_user_id, course_id, semester, section_code, status, attendance_percent
    )
    SELECT v_tenant, u.user_id, v_course1, 3, 'A', 'ENROLLED', att.pct
    FROM (VALUES
      ('ninjal.2549590@mygyanvihar.com', 42.5),
      ('kanika.2549940@mygyanvihar.com', 38.0),
      ('ayasha.2550917@mygyanvihar.com', 55.0)
    ) AS att(email, pct)
    JOIN users u ON lower(u.official_email) = lower(att.email)
    WHERE v_course1 IS NOT NULL
    ON CONFLICT (tenant_id, student_user_id, course_id) DO UPDATE SET
      attendance_percent = EXCLUDED.attendance_percent,
      status = 'ENROLLED';

    INSERT INTO student_course_enrollments (
      tenant_id, student_user_id, course_id, semester, section_code, status, attendance_percent
    )
    SELECT v_tenant, u.user_id, v_course3, 5, 'A', 'ENROLLED', att.pct
    FROM (VALUES
      ('keshav.2454525@mygyanvihar.com', 62.0),
      ('vesika.2455064@mygyanvihar.com', 48.0)
    ) AS att(email, pct)
    JOIN users u ON lower(u.official_email) = lower(att.email)
    WHERE v_course3 IS NOT NULL
    ON CONFLICT (tenant_id, student_user_id, course_id) DO UPDATE SET
      attendance_percent = EXCLUDED.attendance_percent,
      status = 'ENROLLED';
  END IF;

  -- Pending extra-class adjustment for HOD inbox
  IF to_regclass('public.class_adjustments') IS NOT NULL AND v_course2 IS NOT NULL AND v_faculty2 IS NOT NULL THEN
    INSERT INTO class_adjustments (
      tenant_id, course_id, faculty_user_id, adjustment_type, original_date, new_date,
      reason, status, created_at
    )
    SELECT v_tenant, v_course2, v_faculty2, 'EXTRA_CLASS', CURRENT_DATE, CURRENT_DATE + 2,
           'SAS201 remedial session for Applied Sciences Sem III', 'PENDING_HOD_APPROVAL', NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM class_adjustments
      WHERE tenant_id = v_tenant AND course_id = v_course2 AND status = 'PENDING_HOD_APPROVAL'
    );
  END IF;
END $$;

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'schools.applied-sciences-hod-command-center',
  'hod',
  'gaurav.sharma@mygyanvihar.com',
  'department_command_center',
  'SAS courses + syllabus + timetable + red flags',
  'Mirrors CSE HodCommandCenter data shape for Applied Sciences HOD portal.'
)
ON CONFLICT (smoke_key) DO UPDATE SET
  role_email = EXCLUDED.role_email,
  sample_record = EXCLUDED.sample_record,
  notes = EXCLUDED.notes,
  seeded_at = NOW();

-- Command-center parity seeds for all non-CSE departments (same widgets as Sohit / CSE).
-- Skips departments that already have syllabus modules. Idempotent.

DO $$
DECLARE
  cfg RECORD;
  v_tenant UUID;
  v_dept INT;
  v_hod UUID;
  v_program INT;
  v_fac1 UUID;
  v_fac2 UUID;
  v_fac3 UUID;
  v_course1 UUID;
  v_course2 UUID;
  v_course3 UUID;
  v_sub1 INT;
  v_sub2 INT;
  v_sub3 INT;
  v_sub_nf INT;
  v_existing_modules INT;
  v_prefix TEXT;
  v_prog_label TEXT;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF v_tenant IS NULL THEN RETURN; END IF;

  FOR cfg IN
    SELECT * FROM (VALUES
      ('CA', 'CA', 'B.COM CA'),
      ('ISBM', 'ISBM', 'BBA ISBM'),
      ('Applied Sciences', 'SAS', 'BSC APPLIED SCIENCES'),
      ('Mech Engg', 'MECH', 'B.TECH MECH'),
      ('BPT', 'BPT', 'BPT'),
      ('GCAD', 'GCAD', 'B.DES GCAD'),
      ('C3WR', 'C3WR', 'B.TECH C3WR'),
      ('SILS', 'SILS', 'BA SILS'),
      ('Law', 'LAW', 'LLB LAW'),
      ('Education', 'EDU', 'B.ED EDUCATION'),
      ('Agriculture', 'AGR', 'BSC AGRICULTURE'),
      ('Clinical Psychology', 'CLPSY', 'MPSY CLPSY')
    ) AS t(dept_name, prefix, prog_label)
  LOOP
    v_prefix := cfg.prefix;
    v_prog_label := cfg.prog_label;

    SELECT dept_id, hod_user_id INTO v_dept, v_hod
    FROM departments
    WHERE dept_name = cfg.dept_name
    LIMIT 1;

    IF v_dept IS NULL OR v_hod IS NULL THEN
      RAISE NOTICE 'Skipping % — dept or hod_user_id missing', cfg.dept_name;
      CONTINUE;
    END IF;

    SELECT COUNT(*)::int INTO v_existing_modules
    FROM course_modules cm
    JOIN users u ON u.user_id = cm.faculty_user_id
    WHERE u.dept_id = v_dept;

    IF v_existing_modules >= 3 THEN
      RAISE NOTICE 'Skipping % — already has command-center syllabus data', cfg.dept_name;
      CONTINUE;
    END IF;

    SELECT program_id INTO v_program
    FROM iam_programs
    WHERE dept_id = v_dept AND deleted_at IS NULL
    ORDER BY program_id
    LIMIT 1;
    IF v_program IS NULL THEN
      SELECT program_id INTO v_program FROM iam_programs WHERE deleted_at IS NULL ORDER BY program_id LIMIT 1;
    END IF;

    SELECT user_id INTO v_fac1
    FROM users u JOIN roles r ON r.role_id = u.role_id
    WHERE u.dept_id = v_dept AND r.role_name = 'Faculty' AND u.user_id <> v_hod
    ORDER BY u.name LIMIT 1 OFFSET 0;
    SELECT user_id INTO v_fac2
    FROM users u JOIN roles r ON r.role_id = u.role_id
    WHERE u.dept_id = v_dept AND r.role_name = 'Faculty' AND u.user_id <> v_hod
    ORDER BY u.name LIMIT 1 OFFSET 1;
    SELECT user_id INTO v_fac3
    FROM users u JOIN roles r ON r.role_id = u.role_id
    WHERE u.dept_id = v_dept AND r.role_name = 'Faculty' AND u.user_id <> v_hod
    ORDER BY u.name LIMIT 1 OFFSET 2;

    IF v_fac1 IS NULL THEN
      v_fac1 := v_hod;
    END IF;
    IF v_fac2 IS NULL THEN
      v_fac2 := v_fac1;
    END IF;
    IF v_fac3 IS NULL THEN
      v_fac3 := v_fac1;
    END IF;

    INSERT INTO academic_subjects (subject_code, subject_name, subject_shortname, program_id, credits, subject_type, is_active)
    VALUES
      (v_prefix || '101', cfg.dept_name || ' Core I', v_prefix || '1', v_program, 4, 'THEORY', true),
      (v_prefix || '201', cfg.dept_name || ' Core II', v_prefix || '2', v_program, 4, 'THEORY', true),
      (v_prefix || '301', cfg.dept_name || ' Core III', v_prefix || '3', v_program, 4, 'THEORY', true),
      (v_prefix || '401', cfg.dept_name || ' Elective', v_prefix || '4', v_program, 3, 'THEORY', true)
    ON CONFLICT (subject_code) DO UPDATE SET
      subject_name = EXCLUDED.subject_name,
      is_active = true,
      updated_at = NOW();

    SELECT subject_id INTO v_sub1 FROM academic_subjects WHERE subject_code = v_prefix || '101' LIMIT 1;
    SELECT subject_id INTO v_sub2 FROM academic_subjects WHERE subject_code = v_prefix || '201' LIMIT 1;
    SELECT subject_id INTO v_sub3 FROM academic_subjects WHERE subject_code = v_prefix || '301' LIMIT 1;
    SELECT subject_id INTO v_sub_nf FROM academic_subjects WHERE subject_code = v_prefix || '401' LIMIT 1;

    INSERT INTO academic_courses (tenant_id, course_code, course_name, credits, is_elective)
    VALUES
      (v_tenant, v_prefix || '101', cfg.dept_name || ' Core I', 4, false),
      (v_tenant, v_prefix || '201', cfg.dept_name || ' Core II', 4, false),
      (v_tenant, v_prefix || '301', cfg.dept_name || ' Core III', 4, false),
      (v_tenant, v_prefix || '401', cfg.dept_name || ' Elective', 3, true)
    ON CONFLICT (tenant_id, course_code) DO UPDATE SET
      course_name = EXCLUDED.course_name,
      credits = EXCLUDED.credits;

    SELECT course_id INTO v_course1 FROM academic_courses WHERE tenant_id = v_tenant AND course_code = v_prefix || '101' LIMIT 1;
    SELECT course_id INTO v_course2 FROM academic_courses WHERE tenant_id = v_tenant AND course_code = v_prefix || '201' LIMIT 1;
    SELECT course_id INTO v_course3 FROM academic_courses WHERE tenant_id = v_tenant AND course_code = v_prefix || '301' LIMIT 1;

    INSERT INTO academic_course_allocations (
      tenant_id, subject_id, program_name, semester, faculty_user_id, academic_year, course_id, status
    )
    VALUES
      (v_tenant, v_sub1, v_prog_label, 'III', v_fac1, '2026-2027', v_course1, 'ACTIVE'),
      (v_tenant, v_sub2, v_prog_label, 'III', v_fac2, '2026-2027', v_course2, 'ACTIVE'),
      (v_tenant, v_sub3, v_prog_label, 'V', v_fac3, '2026-2027', v_course3, 'ACTIVE'),
      (v_tenant, v_sub_nf, v_prog_label, 'V', NULL, '2026-2027', NULL, 'ACTIVE')
    ON CONFLICT (tenant_id, subject_id, program_name, semester, academic_year) DO UPDATE SET
      faculty_user_id = EXCLUDED.faculty_user_id,
      course_id = EXCLUDED.course_id,
      status = 'ACTIVE',
      updated_at = NOW();

    INSERT INTO academic_timetables (tenant_id, course_id, day_of_week, start_time, end_time, faculty_user_id, room)
    SELECT v_tenant, v_course1, d.dow, '10:00'::time, '11:00'::time, v_fac1, v_prefix || '-101'
    FROM (VALUES (1), (3), (5)) AS d(dow)
    WHERE v_course1 IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM academic_timetables t
        WHERE t.tenant_id = v_tenant AND t.course_id = v_course1 AND t.day_of_week = d.dow
      );

    INSERT INTO academic_timetables (tenant_id, course_id, day_of_week, start_time, end_time, faculty_user_id, room)
    SELECT v_tenant, v_course2, d.dow, '11:00'::time, '12:00'::time, v_fac2, v_prefix || '-102'
    FROM (VALUES (2), (4), (6)) AS d(dow)
    WHERE v_course2 IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM academic_timetables t
        WHERE t.tenant_id = v_tenant AND t.course_id = v_course2 AND t.day_of_week = d.dow
      );

    IF to_regclass('public.course_modules') IS NOT NULL THEN
      INSERT INTO course_modules (
        tenant_id, course_id, faculty_user_id, module_number, title, description, status,
        planned_completion_date, completed_at
      )
      VALUES
        (v_tenant, v_course1, v_fac1, 1, 'Unit 1', 'Intro', 'COMPLETED', CURRENT_DATE - 30, NOW() - INTERVAL '20 days'),
        (v_tenant, v_course1, v_fac1, 2, 'Unit 2', 'Core topics', 'IN_PROGRESS', CURRENT_DATE - 14, NULL),
        (v_tenant, v_course2, v_fac2, 1, 'Unit 1', 'Foundation', 'IN_PROGRESS', CURRENT_DATE - 20, NULL)
      ON CONFLICT (course_id, module_number) DO UPDATE SET
        faculty_user_id = EXCLUDED.faculty_user_id,
        status = EXCLUDED.status,
        planned_completion_date = EXCLUDED.planned_completion_date,
        updated_at = NOW();
    END IF;

    IF to_regclass('public.student_course_enrollments') IS NOT NULL THEN
      INSERT INTO student_course_enrollments (
        tenant_id, student_user_id, course_id, semester, section_code, status, attendance_percent
      )
      SELECT v_tenant, s.user_id, v_course1, 3, 'A', 'ENROLLED', 35.0 + (ROW_NUMBER() OVER (ORDER BY s.name) * 7)
      FROM users s
      JOIN roles r ON r.role_id = s.role_id
      WHERE s.dept_id = v_dept AND r.role_name = 'Student'
      ORDER BY s.name
      LIMIT 3
      ON CONFLICT (tenant_id, student_user_id, course_id) DO UPDATE SET
        attendance_percent = EXCLUDED.attendance_percent,
        status = 'ENROLLED';

      INSERT INTO student_course_enrollments (
        tenant_id, student_user_id, course_id, semester, section_code, status, attendance_percent
      )
      SELECT v_tenant, s.user_id, v_course3, 5, 'A', 'ENROLLED', 40.0 + (ROW_NUMBER() OVER (ORDER BY s.name) * 5)
      FROM users s
      JOIN roles r ON r.role_id = s.role_id
      WHERE s.dept_id = v_dept AND r.role_name = 'Student'
      ORDER BY s.name
      LIMIT 2
      ON CONFLICT (tenant_id, student_user_id, course_id) DO UPDATE SET
        attendance_percent = EXCLUDED.attendance_percent,
        status = 'ENROLLED';
    END IF;

    IF to_regclass('public.class_adjustments') IS NOT NULL AND v_course2 IS NOT NULL THEN
      INSERT INTO class_adjustments (
        tenant_id, course_id, faculty_user_id, adjustment_type, original_date, new_date,
        reason, status, created_at
      )
      SELECT v_tenant, v_course2, v_fac2, 'EXTRA_CLASS', CURRENT_DATE, CURRENT_DATE + 2,
             cfg.dept_name || ' remedial session — pending HOD approval', 'PENDING_HOD_APPROVAL', NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM class_adjustments ca
        JOIN academic_courses c ON c.course_id = ca.course_id
        WHERE ca.tenant_id = v_tenant AND c.course_code LIKE v_prefix || '%' AND ca.status = 'PENDING_HOD_APPROVAL'
      );
    END IF;

    IF to_regclass('public.academic_proxy_requests') IS NOT NULL AND v_course1 IS NOT NULL THEN
      INSERT INTO academic_proxy_requests (
        tenant_id, absent_faculty_id, proxy_faculty_id, course_id, date_of_proxy, reason, status, created_at
      )
      SELECT v_tenant, v_fac1, v_fac2, v_course1, CURRENT_DATE + 1,
             cfg.dept_name || ' proxy class request', 'PENDING_HOD_APPROVAL', NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM academic_proxy_requests pr
        JOIN academic_courses c ON c.course_id = pr.course_id
        WHERE pr.tenant_id = v_tenant AND c.course_code LIKE v_prefix || '%' AND pr.status = 'PENDING_HOD_APPROVAL'
      );
    END IF;

    IF to_regclass('public.hod_dept_placement_drives') IS NOT NULL THEN
      INSERT INTO hod_dept_placement_drives (
        tenant_id, dept_id, company_name, job_role, drive_date, semester, status, created_by
      )
      SELECT v_tenant, v_dept, 'Campus Partner — ' || cfg.dept_name, 'Graduate Trainee', CURRENT_DATE + 14, 5, 'UPCOMING', v_hod
      WHERE NOT EXISTS (
        SELECT 1 FROM hod_dept_placement_drives
        WHERE tenant_id = v_tenant AND dept_id = v_dept AND deleted_at IS NULL
      );
    END IF;

    -- Payslips for department head (My Payslips tab parity).
    IF to_regclass('public.staff_payslips') IS NOT NULL THEN
      INSERT INTO staff_payslips (
        tenant_id, staff_user_id, month, year, gross_pay, net_pay, working_days, lwp_days,
        file_path, is_published, published_at, generated_at
      )
      SELECT v_tenant, v_hod, d.month, d.year, d.gross_pay, d.net_pay, d.working_days, d.lwp_days,
             '/uploads/payslips/smoke-' || lower(v_prefix) || '-' || lower(d.month) || '.pdf',
             TRUE, NOW(), NOW()
      FROM (VALUES
        ('April', 2026, 95000.00, 82000.00, 22, 0.00),
        ('May', 2026, 95000.00, 80500.00, 21, 1.00),
        ('June', 2026, 95000.00, 88000.00, 22, 0.00)
      ) AS d(month, year, gross_pay, net_pay, working_days, lwp_days)
      WHERE NOT EXISTS (
        SELECT 1 FROM staff_payslips sp
        WHERE sp.tenant_id = v_tenant AND sp.staff_user_id = v_hod
          AND sp.month = d.month AND sp.year = d.year AND sp.deleted_at IS NULL
      );
    END IF;

    RAISE NOTICE 'Seeded command-center parity for %', cfg.dept_name;
  END LOOP;
END $$;

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'hod.all-departments-command-center-parity',
  'hod',
  'anil.pal@mygyanvihar.com',
  'department_command_center',
  'Syllabus + timetable + red flags + inbox + placement + payslips per dept',
  'Mirrors CSE HodCommandCenter widget shape for CA, ISBM, Mech, BPT, etc.'
)
ON CONFLICT (smoke_key) DO UPDATE SET
  sample_record = EXCLUDED.sample_record,
  notes = EXCLUDED.notes,
  seeded_at = NOW();

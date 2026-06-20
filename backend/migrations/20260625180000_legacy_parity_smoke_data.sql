-- Smoke data for legacy ERP parity workflows (announcements, proxy, cheques, lesson plan lag, master config).
-- Requires: SGVU tenant, faculty1@, ellwil@, hod@, student1@, finance@, SMOKE101 course.
-- Password for QA personas: password123

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES
  (
    'parity.announcements',
    'admin-ops',
    'registrar@mygyanvihar.com',
    'Global Notice Board',
    'SMOKE: Republic Day holiday',
    'Login registrar → /admin-ops/announcements. Everyone sees same feed on student dashboard and mobile home.'
  ),
  (
    'parity.proxy',
    'academics',
    'hod@mygyanvihar.com',
    'Alternate teaching arrangement',
    'SMOKE proxy pending approval',
    'faculty1 proposed ellwil as proxy for SMOKE101. HOD → /hod/approvals/proxy.'
  ),
  (
    'parity.cheques',
    'finance',
    'finance@mygyanvihar.com',
    'Cheque clearing',
    'SMOKE-CHQ-88421 PENDING_CLEARANCE',
    'Finance → /finance/cheque-clearing. Test Clear and Cheque Returned (bounce penalty).'
  ),
  (
    'parity.lesson-plan',
    'hod',
    'hod@mygyanvihar.com',
    'Plan vs actual syllabus',
    'SMOKE101 modules behind plan',
    'HOD → /hod/academics/syllabus-tracking shows days behind.'
  ),
  (
    'parity.attendance',
    'faculty',
    'faculty1@mygyanvihar.com',
    'Same-hour attendance copy',
    'SMOKE101 10–11 + 11–12 slots',
    'Faculty → /faculty/attendance → Take Same Attendance as Previous.'
  ),
  (
    'parity.master-config',
    'super-admin',
    'superadmin@mygyanvihar.com',
    'Enrollment ID rule',
    'SMOKE-PRN-2026',
    'Super Admin → /super-admin/settings — countries, castes, PRN template.'
  ),
  (
    'parity.birthdays',
    'hod',
    'hod@mygyanvihar.com',
    'Today birthdays widget',
    'student1 birthday today',
    'HOD dashboard shows Today''s Birthdays when student1 DOB matches current date.'
  )
ON CONFLICT (smoke_key) DO UPDATE SET
  portal = EXCLUDED.portal,
  role_email = EXCLUDED.role_email,
  feature_area = EXCLUDED.feature_area,
  sample_record = EXCLUDED.sample_record,
  notes = EXCLUDED.notes,
  seeded_at = NOW();

DO $$
DECLARE
  v_tenant UUID;
  v_student UUID;
  v_faculty1 UUID;
  v_faculty2 UUID;
  v_hod UUID;
  v_finance UUID;
  v_registrar UUID;
  v_course UUID;
  v_timetable1 UUID;
  v_timetable2 UUID;
  v_demand UUID;
  v_module UUID;
BEGIN
  IF to_regclass('public.campus_announcements') IS NULL THEN
    RAISE NOTICE 'Skipping parity smoke: campus_announcements not present';
    RETURN;
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1;
  SELECT user_id INTO v_student FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_faculty1 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_faculty2 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'ellwil@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_hod FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'hod@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_finance FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'finance@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_registrar FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'registrar@mygyanvihar.com' LIMIT 1;
  SELECT course_id INTO v_course FROM academic_courses WHERE tenant_id = v_tenant AND course_code = 'SMOKE101' LIMIT 1;
  IF v_registrar IS NULL THEN v_registrar := v_hod; END IF;

  IF v_tenant IS NULL OR v_faculty1 IS NULL THEN
    RAISE NOTICE 'Skipping parity smoke: tenant or faculty1 missing';
    RETURN;
  END IF;

  -- Global announcements (everyone sees the same feed)
  INSERT INTO campus_announcements (tenant_id, title, body_html, target_all_students, target_all_faculty, created_by_user_id)
  SELECT v_tenant, 'SMOKE: Republic Day holiday',
         '<p>Campus closed on 26 Jan. Classes resume 27 Jan.</p>', true, true, v_registrar
  WHERE NOT EXISTS (
    SELECT 1 FROM campus_announcements WHERE tenant_id = v_tenant AND title = 'SMOKE: Republic Day holiday'
  );

  INSERT INTO campus_announcements (tenant_id, title, body_html, target_all_students, target_all_faculty, created_by_user_id)
  SELECT v_tenant, 'SMOKE: Exam form deadline',
         '<p>Last date to submit exam forms: <strong>15 July 2026</strong>. No late entries.</p>', true, true, v_registrar
  WHERE NOT EXISTS (
    SELECT 1 FROM campus_announcements WHERE tenant_id = v_tenant AND title = 'SMOKE: Exam form deadline'
  );

  -- Birthday widget: student1 birthday = today (age ~20)
  IF v_student IS NOT NULL AND to_regclass('public.student_profiles') IS NOT NULL THEN
    UPDATE student_profiles
    SET date_of_birth = (CURRENT_DATE - INTERVAL '20 years')
    WHERE user_id = v_student AND tenant_id = v_tenant;
  END IF;

  -- Master config samples
  IF to_regclass('public.master_countries') IS NOT NULL THEN
    INSERT INTO master_countries (tenant_id, name, code)
    SELECT v_tenant, 'India', 'IN'
    WHERE NOT EXISTS (SELECT 1 FROM master_countries WHERE tenant_id = v_tenant AND name = 'India');

    INSERT INTO master_castes (tenant_id, name)
    SELECT v_tenant, 'SMOKE-General'
    WHERE NOT EXISTS (SELECT 1 FROM master_castes WHERE tenant_id = v_tenant AND name = 'SMOKE-General');

    INSERT INTO master_categories (tenant_id, name)
    SELECT v_tenant, 'SMOKE-OBC'
    WHERE NOT EXISTS (SELECT 1 FROM master_categories WHERE tenant_id = v_tenant AND name = 'SMOKE-OBC');

    INSERT INTO enrollment_id_rules (tenant_id, rule_name, template, seq_padding)
    SELECT v_tenant, 'SMOKE-PRN-2026', '[YEAR][DEPT][SEQ]', 3
    WHERE NOT EXISTS (SELECT 1 FROM enrollment_id_rules WHERE tenant_id = v_tenant AND rule_name = 'SMOKE-PRN-2026');
  END IF;

  -- Lesson plan lag on SMOKE101
  IF v_course IS NOT NULL AND to_regclass('public.course_modules') IS NOT NULL THEN
    INSERT INTO course_modules (
      tenant_id, course_id, faculty_user_id, module_number, title, status,
      planned_completion_date, hod_approval_status
    )
    SELECT v_tenant, v_course, v_faculty1, 99, 'SMOKE: Unit behind schedule', 'IN_PROGRESS',
           CURRENT_DATE - 12, 'APPROVED'
    WHERE NOT EXISTS (
      SELECT 1 FROM course_modules WHERE tenant_id = v_tenant AND course_id = v_course AND module_number = 99
    );

    SELECT module_id INTO v_module FROM course_modules
    WHERE tenant_id = v_tenant AND course_id = v_course AND module_number = 99 LIMIT 1;

    IF v_module IS NOT NULL THEN
      UPDATE course_modules
      SET planned_completion_date = CURRENT_DATE - 12,
          hod_approval_status = 'APPROVED',
          status = 'IN_PROGRESS'
      WHERE module_id = v_module;
    END IF;
  END IF;

  -- Back-to-back timetable slots (attendance copy QA)
  IF v_course IS NOT NULL AND v_faculty1 IS NOT NULL AND to_regclass('public.academic_timetables') IS NOT NULL THEN
    INSERT INTO academic_timetables (tenant_id, course_id, faculty_user_id, day_of_week, start_time, end_time, room)
    SELECT v_tenant, v_course, v_faculty1, 2, TIME '11:00', TIME '12:00', 'SMOKE-LAB-2'
    WHERE NOT EXISTS (
      SELECT 1 FROM academic_timetables WHERE tenant_id = v_tenant AND course_id = v_course AND room = 'SMOKE-LAB-2'
    );

    SELECT timetable_id INTO v_timetable1 FROM academic_timetables
    WHERE tenant_id = v_tenant AND course_id = v_course AND room = 'SMOKE-LAB-1' LIMIT 1;

    SELECT timetable_id INTO v_timetable2 FROM academic_timetables
    WHERE tenant_id = v_tenant AND course_id = v_course AND room = 'SMOKE-LAB-2' LIMIT 1;

    -- Seed first-hour attendance for today when ISO DOW matches slot (Tuesday = 2)
    IF v_timetable1 IS NOT NULL
       AND EXTRACT(ISODOW FROM CURRENT_DATE) = 2
       AND v_student IS NOT NULL
       AND to_regclass('public.course_attendance_logs') IS NOT NULL THEN
      INSERT INTO course_attendance_logs (tenant_id, course_id, faculty_user_id, date, timetable_id, attendance_data)
      SELECT v_tenant, v_course, v_faculty1, CURRENT_DATE, v_timetable1,
             jsonb_build_array(jsonb_build_object('student_id', v_student::text, 'status', 'PRESENT'))
      WHERE NOT EXISTS (
        SELECT 1 FROM course_attendance_logs
        WHERE tenant_id = v_tenant AND course_id = v_course AND faculty_user_id = v_faculty1
          AND date = CURRENT_DATE AND timetable_id = v_timetable1
      );
    END IF;
  END IF;

  -- Proxy request pending HOD approval
  IF v_course IS NOT NULL AND v_faculty1 IS NOT NULL AND v_faculty2 IS NOT NULL
     AND to_regclass('public.academic_proxy_requests') IS NOT NULL THEN
    SELECT timetable_id INTO v_timetable1 FROM academic_timetables
    WHERE tenant_id = v_tenant AND course_id = v_course AND room = 'SMOKE-LAB-1' LIMIT 1;

    IF v_timetable1 IS NOT NULL THEN
      INSERT INTO academic_proxy_requests (
        tenant_id, timetable_id, absent_faculty_id, proxy_faculty_id, course_id,
        date_of_proxy, reason, status
      )
      SELECT v_tenant, v_timetable1, v_faculty1, v_faculty2, v_course,
             CURRENT_DATE + 3, 'SMOKE: faculty1 leave — ellwil proposed as proxy', 'PENDING_HOD_APPROVAL'
      WHERE NOT EXISTS (
        SELECT 1 FROM academic_proxy_requests
        WHERE tenant_id = v_tenant AND absent_faculty_id = v_faculty1
          AND date_of_proxy = CURRENT_DATE + 3 AND status = 'PENDING_HOD_APPROVAL'
      );
    END IF;
  END IF;

  -- Lecture suspension proposal pending
  IF v_course IS NOT NULL AND to_regclass('public.class_adjustments') IS NOT NULL THEN
    INSERT INTO class_adjustments (
      tenant_id, course_id, faculty_user_id, adjustment_type, original_date, reason, status
    )
    SELECT v_tenant, v_course, v_faculty1, 'SUSPENSION', CURRENT_DATE + 5,
           'SMOKE: lab equipment maintenance — class suspended for one day', 'PENDING_HOD_APPROVAL'
    WHERE NOT EXISTS (
      SELECT 1 FROM class_adjustments
      WHERE tenant_id = v_tenant AND course_id = v_course AND adjustment_type = 'SUSPENSION'
        AND reason LIKE 'SMOKE: lab equipment%'
    );
  END IF;

  -- Pending cheque clearance
  IF v_student IS NOT NULL AND to_regclass('public.finance_transactions') IS NOT NULL THEN
    SELECT demand_id INTO v_demand FROM finance_fee_demands
    WHERE tenant_id = v_tenant AND student_user_id = v_student AND fee_head = 'SMOKE-FEE-2026-001' LIMIT 1;

    INSERT INTO finance_transactions (
      tenant_id, student_user_id, demand_id, gateway, payment_mode, amount, status,
      cheque_number, bank_name, cheque_status, gateway_payment_id
    )
    SELECT v_tenant, v_student, v_demand, 'CHEQUE', 'CHEQUE', 25000, 'INITIATED',
           'SMOKE-CHQ-88421', 'SMOKE State Bank', 'PENDING_CLEARANCE', 'pay_smoke_chq_88421'
    WHERE NOT EXISTS (
      SELECT 1 FROM finance_transactions WHERE gateway_payment_id = 'pay_smoke_chq_88421'
    );
  END IF;

  RAISE NOTICE 'Legacy parity smoke data applied for tenant %', v_tenant;
END $$;

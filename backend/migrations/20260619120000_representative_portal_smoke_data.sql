-- Representative portal smoke data for SGVU.
-- Scope: broad, idempotent, preserve existing demo/local data.
-- This migration intentionally guards optional tables so partial local databases can still run it.

CREATE TABLE IF NOT EXISTS smoke_seed_manifest (
  smoke_key VARCHAR(120) PRIMARY KEY,
  portal VARCHAR(80) NOT NULL,
  role_email VARCHAR(255),
  feature_area VARCHAR(160) NOT NULL,
  sample_record VARCHAR(255) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'SEEDED',
  notes TEXT,
  seeded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES
  ('auth.qa-personas', 'auth', 'dev.librarian@mygyanvihar.com', 'Local QA logins', 'dev.* and master QA persona credentials', 'Password for QA personas is password123.'),
  ('admissions.pipeline', 'admissions-crm', 'dev.admissionsofficer@mygyanvihar.com', 'Application pipeline', 'SMOKE-ADM-2026-001', 'Submitted B.Tech CSE application with counseling/document rows when tables exist.'),
  ('student.dashboard', 'student-portal', 'student1@mygyanvihar.com', 'Student profile and academics', 'SMOKE101 enrollment', 'Course, timetable, assignment, marks, certificates, grievance and exit data where tables exist.'),
  ('faculty.workspace', 'academics', 'faculty1@mygyanvihar.com', 'Teaching workspace', 'SMOKE101 assignment and marks', 'Faculty/HOD can see course activity and assessment records.'),
  ('exam-cell.schedule', 'exam-cell', 'examcell@mygyanvihar.com', 'Exam schedule and application', 'SMOKE101 Mid Term', 'Exam row is inserted only when subject prerequisites exist.'),
  ('finance.fees', 'finance', 'finance@mygyanvihar.com', 'Fee demand, payment, ledger and vendor', 'SMOKE-FEE-2026-001', 'Includes a partially paid student demand and vendor invoice where tables exist.'),
  ('hr.workforce', 'hr', 'hr@mygyanvihar.com', 'Attendance, leave and onboarding', 'SMOKE-HR-LEAVE', 'Adds attendance/leave/appraisal/workflow samples where tables exist.'),
  ('hostel.operations', 'hostel-admin', 'warden@mygyanvihar.com', 'Hostel request and tatkal', 'SMOKE-HOSTEL-GATEPASS', 'Adds student hostel request, wallet/tatkal samples where tables exist.'),
  ('library.circulation', 'library', 'library@mygyanvihar.com', 'Catalog, circulation, reservation and gate visit', 'SMOKE-LIB-001', 'Adds a smoke book, copy, issue, reservation and visit where tables exist.'),
  ('transport.pass', 'transport', 'dev.transportofficer@mygyanvihar.com', 'Route, stop, allocation and pass token', 'SMOKE Route A', 'Adds route/stop/allocation only when transport tables exist.'),
  ('wallet.mess', 'campus-wallet', 'student1@mygyanvihar.com', 'Wallet ledger and mess order', 'SMOKE-WALLET-TOPUP', 'Adds wallet, ledger, addon order and meal token where tables exist.'),
  ('events.ticketing', 'campus-events', 'student1@mygyanvihar.com', 'Event approval and registration', 'Smoke Innovation Day', 'Adds approved event and student registration where tables exist.'),
  ('helpdesk.ticket', 'helpdesk', 'student1@mygyanvihar.com', 'Ticket and SLA', 'SMOKE-HELPDESK-001', 'Adds a representative helpdesk ticket when table exists.'),
  ('placement.ats', 'placements', 'dev.placementcell@mygyanvihar.com', 'Job posting and application', 'Smoke Software Engineer', 'Adds placement posting/application and skills where tables exist.'),
  ('alumni.engagement', 'alumni-admin', 'iqac@mygyanvihar.com', 'Alumni profile, event and donation', 'Smoke Alumni Connect', 'Adds alumni engagement rows where tables exist.'),
  ('iqac.accreditation', 'iqac', 'iqac@mygyanvihar.com', 'Documents, KPI and research evidence', 'SMOKE-NAAC-2.3', 'Adds IQAC document/report and faculty research evidence where tables exist.'),
  ('leadership.reporting', 'leadership', 'president@mygyanvihar.com', 'Executive reporting', 'SMOKE-EXEC-SNAPSHOT', 'Manifest entry plus finance/research/HR data for leadership dashboards.'),
  ('admin.ops', 'admin-ops', 'registrar@mygyanvihar.com', 'Fleet/assets/clinic/reporting', 'SMOKE-FLEET-001', 'Adds fleet/clinic/admin samples where tables exist.'),
  ('search.directory', 'search', 'superadmin@mygyanvihar.com', 'Global search and directory', 'smoke searchable records', 'Smoke records use SMOKE prefixes for easy global search.')
ON CONFLICT (smoke_key) DO UPDATE SET
  portal = EXCLUDED.portal,
  role_email = EXCLUDED.role_email,
  feature_area = EXCLUDED.feature_area,
  sample_record = EXCLUDED.sample_record,
  status = EXCLUDED.status,
  notes = EXCLUDED.notes,
  seeded_at = NOW();

DO $$
DECLARE
  v_tenant UUID;
  v_student UUID;
  v_student2 UUID;
  v_faculty UUID;
  v_hod UUID;
  v_hr UUID;
  v_warden UUID;
  v_librarian UUID;
  v_finance UUID;
  v_iqac UUID;
  v_registrar UUID;
  v_transport UUID;
  v_placement UUID;
  v_superadmin UUID;
  v_dept INT;
  v_course UUID;
  v_catalog UUID;
  v_copy UUID;
  v_route UUID;
  v_stop UUID;
  v_wallet UUID;
  v_event UUID;
  v_company UUID;
  v_jd UUID;
  v_job UUID;
  v_app UUID;
  v_alumni UUID;
  v_club UUID;
  v_template UUID;
  v_demand UUID;
  v_ledger_cash UUID;
  v_ledger_income UUID;
  v_vendor UUID;
  v_expense_head UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Skipping representative smoke data: tenant sgvu not found';
    RETURN;
  END IF;

  SELECT user_id INTO v_student FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student2 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student2@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_faculty FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_hod FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'hod@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_hr FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'hr@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_warden FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'warden@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_librarian FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'library@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_finance FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'finance@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_iqac FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'iqac@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_registrar FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'registrar@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_transport FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'dev.transportofficer@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_placement FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'dev.placementcell@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_superadmin FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'superadmin@mygyanvihar.com' LIMIT 1;
  SELECT dept_id INTO v_dept FROM departments WHERE dept_name = 'Computer Science' LIMIT 1;

  -- Admissions CRM
  IF to_regclass('public.student_applications') IS NOT NULL THEN
    INSERT INTO student_applications (
      tenant_id, student_user_id, application_no, applicant_name, program_applied,
      admission_type, category, gender, date_of_birth, nationality, application_payload,
      status, submitted_at
    )
    SELECT v_tenant, v_student2, 'SMOKE-ADM-2026-001', 'Smoke Applicant One',
           'B.Tech Computer Science', 'REGULAR', 'GENERAL', 'Female',
           DATE '2007-08-18', 'Indian',
           jsonb_build_object('source', 'smoke-seed', 'leadScore', 82),
           'UNDER_REVIEW', NOW() - INTERVAL '2 days'
    WHERE NOT EXISTS (
      SELECT 1 FROM student_applications WHERE tenant_id = v_tenant AND application_no = 'SMOKE-ADM-2026-001'
    );

    SELECT application_id INTO v_app FROM student_applications WHERE tenant_id = v_tenant AND application_no = 'SMOKE-ADM-2026-001' LIMIT 1;

    IF v_app IS NOT NULL AND to_regclass('public.entrance_exam_details') IS NOT NULL THEN
      INSERT INTO entrance_exam_details (tenant_id, application_id, exam_name, roll_number, exam_date, score, percentile, rank_obtained, result_status)
      SELECT v_tenant, v_app, 'SGVU-CET', 'SMK-CET-001', CURRENT_DATE - 10, 86.50, 91.250, 128, 'QUALIFIED'
      WHERE NOT EXISTS (SELECT 1 FROM entrance_exam_details WHERE tenant_id = v_tenant AND application_id = v_app AND exam_name = 'SGVU-CET');
    END IF;

    IF v_app IS NOT NULL AND to_regclass('public.counseling_details') IS NOT NULL THEN
      INSERT INTO counseling_details (tenant_id, application_id, round_no, counseling_date, allotted_program, allotted_department_id, seat_category, decision, remarks)
      SELECT v_tenant, v_app, 1, CURRENT_DATE + 3, 'B.Tech Computer Science', v_dept, 'GENERAL', 'PENDING', 'Smoke counseling row for admissions pipeline'
      WHERE NOT EXISTS (SELECT 1 FROM counseling_details WHERE tenant_id = v_tenant AND application_id = v_app AND round_no = 1);
    END IF;
  END IF;

  -- Academics / Faculty / Student
  IF to_regclass('public.academic_courses') IS NOT NULL THEN
    INSERT INTO academic_courses (tenant_id, course_code, course_name, credits, is_elective)
    SELECT v_tenant, 'SMOKE101', 'Smoke Data Engineering Lab', 4, false
    WHERE NOT EXISTS (SELECT 1 FROM academic_courses WHERE tenant_id = v_tenant AND course_code = 'SMOKE101');

    SELECT course_id INTO v_course FROM academic_courses WHERE tenant_id = v_tenant AND course_code = 'SMOKE101' LIMIT 1;

    IF v_course IS NOT NULL AND v_student IS NOT NULL AND to_regclass('public.student_course_enrollments') IS NOT NULL THEN
      INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, status, attendance_percent)
      SELECT v_tenant, v_student, v_course, 3, 'ENROLLED', 92.50
      WHERE NOT EXISTS (
        SELECT 1 FROM student_course_enrollments WHERE tenant_id = v_tenant AND student_user_id = v_student AND course_id = v_course
      );
    END IF;

    IF v_course IS NOT NULL AND v_faculty IS NOT NULL AND to_regclass('public.academic_timetables') IS NOT NULL THEN
      INSERT INTO academic_timetables (tenant_id, course_id, faculty_user_id, day_of_week, start_time, end_time, room)
      SELECT v_tenant, v_course, v_faculty, 2, TIME '10:00', TIME '11:00', 'SMOKE-LAB-1'
      WHERE NOT EXISTS (
        SELECT 1 FROM academic_timetables WHERE tenant_id = v_tenant AND course_id = v_course AND room = 'SMOKE-LAB-1'
      );
    END IF;

    IF v_course IS NOT NULL AND v_faculty IS NOT NULL AND to_regclass('public.academic_assignments') IS NOT NULL THEN
      INSERT INTO academic_assignments (tenant_id, course_id, faculty_user_id, title, description, due_date, max_marks)
      SELECT v_tenant, v_course, v_faculty, 'SMOKE: Build a campus analytics query',
             'Representative assignment for smoke testing faculty and student LMS views.',
             CURRENT_DATE + 7, 20
      WHERE NOT EXISTS (
        SELECT 1 FROM academic_assignments WHERE tenant_id = v_tenant AND course_id = v_course AND title = 'SMOKE: Build a campus analytics query'
      );
    END IF;

    IF v_course IS NOT NULL AND v_student IS NOT NULL AND to_regclass('public.academic_marks') IS NOT NULL THEN
      INSERT INTO academic_marks (tenant_id, student_user_id, course_id, exam_type, marks_obtained, max_marks, status, published_at)
      SELECT v_tenant, v_student, v_course, 'INTERNAL', 17, 20, 'PUBLISHED', NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM academic_marks WHERE tenant_id = v_tenant AND student_user_id = v_student AND course_id = v_course AND exam_type = 'INTERNAL'
      );
    END IF;

    IF v_course IS NOT NULL AND v_student IS NOT NULL AND to_regclass('public.academic_records') IS NOT NULL THEN
      INSERT INTO academic_records (
        tenant_id, student_user_id, academic_year, semester, internal_marks,
        mid_term_marks, end_semester_marks, credits_registered, credits_earned,
        sgpa, cgpa, backlog_count, progression_status, remarks
      )
      SELECT v_tenant, v_student, '2026-27', 3, 18, 24, 46, 22, 22, 8.40, 8.25, 0, 'PROMOTED', 'Smoke academic progress row'
      WHERE NOT EXISTS (
        SELECT 1 FROM academic_records WHERE tenant_id = v_tenant AND student_user_id = v_student AND academic_year = '2026-27' AND semester = 3
      );
    END IF;
  END IF;

  IF v_student IS NOT NULL AND to_regclass('public.student_certificates') IS NOT NULL THEN
    INSERT INTO student_certificates (
      tenant_id, student_user_id, title, issuer, issue_date, file_path,
      original_filename, mime_type, file_size, verification_status, points_awarded
    )
    SELECT v_tenant, v_student, 'SMOKE: Campus QA Participation', 'Falcon QA Cell',
           CURRENT_DATE - 20, '/smoke/certificates/campus-qa.pdf',
           'campus-qa.pdf', 'application/pdf', 204800, 'PENDING', 5
    WHERE NOT EXISTS (
      SELECT 1 FROM student_certificates WHERE tenant_id = v_tenant AND student_user_id = v_student AND title = 'SMOKE: Campus QA Participation'
    );
  END IF;

  IF v_student IS NOT NULL AND to_regclass('public.student_grievance_tickets') IS NOT NULL THEN
    INSERT INTO student_grievance_tickets (tenant_id, student_user_id, category, subject, description, priority, status, assigned_to_user_id)
    SELECT v_tenant, v_student, 'Academics', 'SMOKE: timetable clash', 'Representative student grievance for smoke testing.', 'MEDIUM', 'OPEN', v_registrar
    WHERE NOT EXISTS (
      SELECT 1 FROM student_grievance_tickets WHERE tenant_id = v_tenant AND student_user_id = v_student AND subject = 'SMOKE: timetable clash'
    );
  END IF;

  -- Exam cell / exam applications
  IF v_course IS NOT NULL AND v_student IS NOT NULL AND to_regclass('public.exam_schedules') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'exam_schedules' AND column_name = 'course_id'
    ) THEN
      INSERT INTO exam_schedules (tenant_id, course_id, exam_type, exam_date, start_time, end_time, venue, max_marks, status)
      SELECT v_tenant, v_course, 'SMOKE_MID_TERM', CURRENT_DATE + 14, TIME '09:30', TIME '11:30', 'SMOKE-EXAM-HALL', 50, 'SCHEDULED'
      WHERE NOT EXISTS (
        SELECT 1 FROM exam_schedules WHERE tenant_id = v_tenant AND exam_type = 'SMOKE_MID_TERM' AND venue = 'SMOKE-EXAM-HALL'
      );
    END IF;
  END IF;

  -- Finance
  IF to_regclass('public.finance_fee_templates') IS NOT NULL THEN
    INSERT INTO finance_fee_templates (tenant_id, template_name, program_code, batch_year, academic_year, semester, fee_breakup, total_amount, is_active)
    SELECT v_tenant, 'SMOKE B.Tech CSE Sem 3', 'BTECH-CSE', 2026, '2026-27', 3,
           jsonb_build_object('tuition', 45000, 'exam', 2500, 'library', 1500), 49000, true
    WHERE NOT EXISTS (SELECT 1 FROM finance_fee_templates WHERE tenant_id = v_tenant AND template_name = 'SMOKE B.Tech CSE Sem 3');
    SELECT template_id INTO v_template FROM finance_fee_templates WHERE tenant_id = v_tenant AND template_name = 'SMOKE B.Tech CSE Sem 3' LIMIT 1;
  END IF;

  IF v_student IS NOT NULL
    AND to_regclass('public.finance_fee_demands') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'finance_fee_demands' AND column_name = 'tenant_id'
    )
  THEN
    INSERT INTO finance_fee_demands (tenant_id, student_user_id, fee_head, academic_year, semester, total_amount, paid_amount, due_date, status, fee_breakup, template_id)
    SELECT v_tenant, v_student, 'SMOKE-FEE-2026-001', '2026-27', 3, 49000, 15000, CURRENT_DATE + 20, 'PARTIAL',
           jsonb_build_object('tuition', 45000, 'exam', 2500, 'library', 1500), v_template
    WHERE NOT EXISTS (
      SELECT 1 FROM finance_fee_demands WHERE tenant_id = v_tenant AND student_user_id = v_student AND fee_head = 'SMOKE-FEE-2026-001'
    );

    SELECT demand_id INTO v_demand FROM finance_fee_demands WHERE tenant_id = v_tenant AND student_user_id = v_student AND fee_head = 'SMOKE-FEE-2026-001' LIMIT 1;

    IF v_demand IS NOT NULL
      AND to_regclass('public.finance_transactions') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'finance_transactions' AND column_name = 'tenant_id'
      )
    THEN
      INSERT INTO finance_transactions (tenant_id, demand_id, student_user_id, gateway, gateway_reference, gateway_order_id, gateway_payment_id, amount, status, payment_mode)
      SELECT v_tenant, v_demand, v_student, 'RAZORPAY', 'SMOKE-FIN-REF-001', 'order_smoke_001', 'pay_smoke_001', 15000, 'SUCCESS', 'UPI'
      WHERE NOT EXISTS (SELECT 1 FROM finance_transactions WHERE gateway_payment_id = 'pay_smoke_001');
    END IF;
  END IF;

  IF to_regclass('public.finance_ledger_accounts') IS NOT NULL THEN
    INSERT INTO finance_ledger_accounts (tenant_id, account_code, account_name, account_type)
    SELECT v_tenant, 'SMK100', 'Smoke Cash Account', 'ASSET'
    WHERE NOT EXISTS (SELECT 1 FROM finance_ledger_accounts WHERE tenant_id = v_tenant AND account_code = 'SMK100');
    INSERT INTO finance_ledger_accounts (tenant_id, account_code, account_name, account_type)
    SELECT v_tenant, 'SMK400', 'Smoke Fee Income', 'INCOME'
    WHERE NOT EXISTS (SELECT 1 FROM finance_ledger_accounts WHERE tenant_id = v_tenant AND account_code = 'SMK400');
    SELECT ledger_account_id INTO v_ledger_cash FROM finance_ledger_accounts WHERE tenant_id = v_tenant AND account_code = 'SMK100' LIMIT 1;
    SELECT ledger_account_id INTO v_ledger_income FROM finance_ledger_accounts WHERE tenant_id = v_tenant AND account_code = 'SMK400' LIMIT 1;
  END IF;

  IF to_regclass('public.finance_expense_heads') IS NOT NULL THEN
    INSERT INTO finance_expense_heads (tenant_id, head_code, head_name, ledger_account_id)
    SELECT v_tenant, 'SMKOPS', 'Smoke Operations Expense', v_ledger_cash
    WHERE NOT EXISTS (SELECT 1 FROM finance_expense_heads WHERE tenant_id = v_tenant AND head_code = 'SMKOPS');
    SELECT expense_head_id INTO v_expense_head FROM finance_expense_heads WHERE tenant_id = v_tenant AND head_code = 'SMKOPS' LIMIT 1;
  END IF;

  IF to_regclass('public.fin_vendors') IS NOT NULL THEN
    INSERT INTO fin_vendors (tenant_id, business_name, contact_email, gstin, pan_number, default_tds_rate, is_active)
    SELECT v_tenant, 'Smoke Campus Supplies Pvt Ltd', 'smoke.vendor@example.com', '08ABCDE1234F1Z5', 'ABCDE1234F', 2.00, true
    WHERE NOT EXISTS (SELECT 1 FROM fin_vendors WHERE tenant_id = v_tenant AND gstin = '08ABCDE1234F1Z5');
    SELECT vendor_id INTO v_vendor FROM fin_vendors WHERE tenant_id = v_tenant AND gstin = '08ABCDE1234F1Z5' LIMIT 1;
  END IF;

  IF v_vendor IS NOT NULL AND to_regclass('public.fin_vendor_invoices') IS NOT NULL THEN
    INSERT INTO fin_vendor_invoices (tenant_id, vendor_id, invoice_number, invoice_date, expense_head_id, taxable_amount, gst_amount, tds_amount, total_amount, net_payable, status)
    SELECT v_tenant, v_vendor, 'SMOKE-INV-001', CURRENT_DATE, v_expense_head, 10000, 1800, 200, 11800, 11600, 'PENDING'
    WHERE NOT EXISTS (SELECT 1 FROM fin_vendor_invoices WHERE tenant_id = v_tenant AND vendor_id = v_vendor AND invoice_number = 'SMOKE-INV-001');
  END IF;

  IF v_ledger_cash IS NOT NULL AND v_ledger_income IS NOT NULL AND to_regclass('public.finance_journal_entries') IS NOT NULL THEN
    INSERT INTO finance_journal_entries (tenant_id, entry_date, narration, source_type, source_id)
    SELECT v_tenant, CURRENT_DATE, 'SMOKE: partial fee receipt posted', 'SMOKE', v_demand
    WHERE NOT EXISTS (SELECT 1 FROM finance_journal_entries WHERE tenant_id = v_tenant AND narration = 'SMOKE: partial fee receipt posted');
  END IF;

  -- HR
  IF v_faculty IS NOT NULL AND to_regclass('public.hr_daily_attendance') IS NOT NULL THEN
    INSERT INTO hr_daily_attendance (user_id, date, first_in_time, last_out_time, total_hours, status, calculated_status)
    SELECT v_faculty, CURRENT_DATE, CURRENT_DATE + TIME '09:12', CURRENT_DATE + TIME '16:05', 6.88, 'PRESENT', 'LATE_COMING'
    WHERE NOT EXISTS (SELECT 1 FROM hr_daily_attendance WHERE user_id = v_faculty AND date = CURRENT_DATE);
  END IF;

  IF v_faculty IS NOT NULL AND to_regclass('public.staff_leave_requests') IS NOT NULL THEN
    INSERT INTO staff_leave_requests (tenant_id, staff_user_id, leave_type, start_date, end_date, reason, status)
    SELECT v_tenant, v_faculty, 'CL', CURRENT_DATE + 5, CURRENT_DATE + 5, 'SMOKE: one-day personal work', 'PENDING'
    WHERE NOT EXISTS (
      SELECT 1 FROM staff_leave_requests WHERE staff_user_id = v_faculty AND reason = 'SMOKE: one-day personal work'
    );
  END IF;

  IF v_hr IS NOT NULL
    AND to_regclass('public.hr_employee_onboarding_tasks') IS NOT NULL
    AND to_regclass('public.hr_workflow_templates') IS NOT NULL
    AND to_regclass('public.org_entities') IS NOT NULL
  THEN
    INSERT INTO hr_workflow_templates (tenant_id, entity_id, workflow_type, stage_name, task_name, is_mandatory, step_order)
    SELECT v_tenant, oe.entity_id, 'ONBOARDING', 'SMOKE_JOINING', 'Verify smoke joining kit', true, 1
    FROM org_entities oe
    WHERE oe.tenant_id = v_tenant
      AND oe.entity_code = 'SGVU_UNIVERSITY'
      AND NOT EXISTS (
        SELECT 1 FROM hr_workflow_templates WHERE tenant_id = v_tenant AND workflow_type = 'ONBOARDING' AND task_name = 'Verify smoke joining kit'
      );
  END IF;

  -- Library
  IF to_regclass('public.lib_catalog') IS NOT NULL THEN
    INSERT INTO lib_catalog (tenant_id, isbn, title, author, publisher, edition, category, synopsis)
    SELECT v_tenant, 'SMOKE-LIB-001', 'Smoke Testing Campus Systems', 'Falcon QA Team', 'SGVU Press', '1st', 'Quality Assurance',
           'Representative catalog item for library smoke testing.'
    WHERE NOT EXISTS (SELECT 1 FROM lib_catalog WHERE tenant_id = v_tenant AND isbn = 'SMOKE-LIB-001');
    SELECT catalog_id INTO v_catalog FROM lib_catalog WHERE tenant_id = v_tenant AND isbn = 'SMOKE-LIB-001' LIMIT 1;
  END IF;

  IF v_catalog IS NOT NULL AND to_regclass('public.lib_inventory_copies') IS NOT NULL THEN
    INSERT INTO lib_inventory_copies (tenant_id, catalog_id, accession_number, shelf_location, status)
    SELECT v_tenant, v_catalog, 'SMOKE-LIB-COPY-001', 'Smoke Shelf A1', 'ISSUED'
    WHERE NOT EXISTS (SELECT 1 FROM lib_inventory_copies WHERE tenant_id = v_tenant AND accession_number = 'SMOKE-LIB-COPY-001');
    SELECT copy_id INTO v_copy FROM lib_inventory_copies WHERE tenant_id = v_tenant AND accession_number = 'SMOKE-LIB-COPY-001' LIMIT 1;
  END IF;

  IF v_copy IS NOT NULL AND v_student IS NOT NULL AND to_regclass('public.lib_circulation') IS NOT NULL THEN
    INSERT INTO lib_circulation (tenant_id, copy_id, user_id, issued_at, due_date, renewed_count, fine_amount)
    SELECT v_tenant, v_copy, v_student, NOW() - INTERVAL '3 days', NOW() + INTERVAL '11 days', 0, 0
    WHERE NOT EXISTS (SELECT 1 FROM lib_circulation WHERE tenant_id = v_tenant AND copy_id = v_copy AND user_id = v_student AND returned_at IS NULL);
  END IF;

  IF v_catalog IS NOT NULL AND v_student2 IS NOT NULL AND to_regclass('public.lib_reservations') IS NOT NULL THEN
    INSERT INTO lib_reservations (tenant_id, catalog_id, user_id, queue_position, status)
    SELECT v_tenant, v_catalog, v_student2, 1, 'WAITING'
    WHERE NOT EXISTS (SELECT 1 FROM lib_reservations WHERE tenant_id = v_tenant AND catalog_id = v_catalog AND user_id = v_student2);
  END IF;

  IF v_student IS NOT NULL AND to_regclass('public.lib_gate_visits') IS NOT NULL THEN
    INSERT INTO lib_gate_visits (tenant_id, user_id, entered_at, exited_at)
    SELECT v_tenant, v_student, NOW() - INTERVAL '30 minutes', NULL
    WHERE NOT EXISTS (SELECT 1 FROM lib_gate_visits WHERE tenant_id = v_tenant AND user_id = v_student AND exited_at IS NULL);
  END IF;

  -- Hostel / wallet / mess
  IF v_student IS NOT NULL AND to_regclass('public.hostel_requests') IS NOT NULL THEN
    INSERT INTO hostel_requests (student_user_id, request_type, payload, remarks, status, warden_user_id, qr_token)
    SELECT v_student, 'GATE_PASS', jsonb_build_object('outTime', NOW() + INTERVAL '2 hours', 'reason', 'SMOKE gate pass'), 'SMOKE-HOSTEL-GATEPASS', 'PENDING', v_warden, 'SMOKE-GATEPASS-001'
    WHERE NOT EXISTS (SELECT 1 FROM hostel_requests WHERE student_user_id = v_student AND remarks = 'SMOKE-HOSTEL-GATEPASS');
  END IF;

  IF v_student IS NOT NULL AND to_regclass('public.campus_wallets') IS NOT NULL THEN
    INSERT INTO campus_wallets (tenant_id, student_user_id, current_balance)
    SELECT v_tenant, v_student, 750.00
    WHERE NOT EXISTS (SELECT 1 FROM campus_wallets WHERE tenant_id = v_tenant AND student_user_id = v_student);
    SELECT wallet_id INTO v_wallet FROM campus_wallets WHERE tenant_id = v_tenant AND student_user_id = v_student LIMIT 1;
  END IF;

  IF v_wallet IS NOT NULL AND to_regclass('public.campus_wallet_ledger') IS NOT NULL THEN
    INSERT INTO campus_wallet_ledger (wallet_id, entry_type, amount, balance_after, reference_id, note)
    SELECT v_wallet, 'CREDIT', 750.00, 750.00, 'SMOKE-WALLET-TOPUP', 'Smoke wallet opening balance'
    WHERE NOT EXISTS (SELECT 1 FROM campus_wallet_ledger WHERE wallet_id = v_wallet AND reference_id = 'SMOKE-WALLET-TOPUP');
  END IF;

  IF v_student IS NOT NULL AND to_regclass('public.mess_addon_catalog') IS NOT NULL AND to_regclass('public.mess_addon_orders') IS NOT NULL THEN
    INSERT INTO mess_addon_orders (tenant_id, student_user_id, item_id, item_name, amount_deducted, order_date, meal_type, is_redeemed)
    SELECT v_tenant, v_student, item_id, item_name, price, CURRENT_DATE, meal_type, false
    FROM mess_addon_catalog
    WHERE tenant_id = v_tenant AND is_active = true
    ORDER BY created_at
    LIMIT 1;
  END IF;

  IF v_student IS NOT NULL AND to_regclass('public.mess_meal_tokens') IS NOT NULL THEN
    INSERT INTO mess_meal_tokens (tenant_id, student_user_id, token_hash, expires_at)
    SELECT v_tenant, v_student, 'SMOKE-MEAL-TOKEN-001', NOW() + INTERVAL '8 hours'
    WHERE NOT EXISTS (SELECT 1 FROM mess_meal_tokens WHERE tenant_id = v_tenant AND token_hash = 'SMOKE-MEAL-TOKEN-001');
  END IF;

  -- Transport
  IF to_regclass('public.transport_routes') IS NOT NULL THEN
    INSERT INTO transport_routes (tenant_id, route_name, driver_user_id, total_seats, is_active)
    SELECT v_tenant, 'SMOKE Route A - Mansarovar', v_transport, 42, true
    WHERE NOT EXISTS (SELECT 1 FROM transport_routes WHERE tenant_id = v_tenant AND route_name = 'SMOKE Route A - Mansarovar');
    SELECT route_id INTO v_route FROM transport_routes WHERE tenant_id = v_tenant AND route_name = 'SMOKE Route A - Mansarovar' LIMIT 1;
  END IF;

  IF v_route IS NOT NULL AND to_regclass('public.transport_stops') IS NOT NULL THEN
    INSERT INTO transport_stops (tenant_id, route_id, stop_name, latitude, longitude, pickup_time, fee_amount, stop_order)
    SELECT v_tenant, v_route, 'SMOKE Mansarovar Metro', 26.85610000, 75.76360000, TIME '08:05', 12000, 1
    WHERE NOT EXISTS (SELECT 1 FROM transport_stops WHERE tenant_id = v_tenant AND route_id = v_route AND stop_name = 'SMOKE Mansarovar Metro');
    SELECT stop_id INTO v_stop FROM transport_stops WHERE tenant_id = v_tenant AND route_id = v_route AND stop_name = 'SMOKE Mansarovar Metro' LIMIT 1;
  END IF;

  IF v_route IS NOT NULL AND v_stop IS NOT NULL AND v_student IS NOT NULL AND to_regclass('public.transport_allocations') IS NOT NULL THEN
    INSERT INTO transport_allocations (tenant_id, student_user_id, route_id, stop_id, fee_demand_id, academic_year, payment_status, pass_status, valid_until)
    SELECT v_tenant, v_student, v_route, v_stop, v_demand, '2026-27', 'PAID', 'ACTIVE', CURRENT_DATE + 180
    WHERE NOT EXISTS (SELECT 1 FROM transport_allocations WHERE student_user_id = v_student);
  END IF;

  -- Events
  IF to_regclass('public.campus_clubs') IS NOT NULL THEN
    INSERT INTO campus_clubs (tenant_id, name, description, faculty_advisor_id, student_coordinator_id)
    SELECT v_tenant, 'SMOKE Innovation Club', 'Smoke testing club for events and registrations.', v_faculty, v_student
    WHERE NOT EXISTS (SELECT 1 FROM campus_clubs WHERE tenant_id = v_tenant AND name = 'SMOKE Innovation Club');
    SELECT club_id INTO v_club FROM campus_clubs WHERE tenant_id = v_tenant AND name = 'SMOKE Innovation Club' LIMIT 1;
  END IF;

  IF v_club IS NOT NULL AND to_regclass('public.campus_events') IS NOT NULL THEN
    INSERT INTO campus_events (tenant_id, club_id, title, description, venue, event_date, total_slots, available_slots, is_paid, ticket_price, status, approved_by, approved_at)
    SELECT v_tenant, v_club, 'SMOKE Innovation Day', 'Representative approved campus event.', 'SMOKE Auditorium',
           NOW() + INTERVAL '12 days', 100, 99, true, 199.00, 'APPROVED', v_registrar, NOW()
    WHERE NOT EXISTS (SELECT 1 FROM campus_events WHERE tenant_id = v_tenant AND title = 'SMOKE Innovation Day');
    SELECT event_id INTO v_event FROM campus_events WHERE tenant_id = v_tenant AND title = 'SMOKE Innovation Day' LIMIT 1;
  END IF;

  IF v_event IS NOT NULL AND v_student IS NOT NULL AND to_regclass('public.event_registrations') IS NOT NULL THEN
    INSERT INTO event_registrations (tenant_id, event_id, student_user_id, status, payment_status, transaction_id, qr_code)
    SELECT v_tenant, v_event, v_student, 'CONFIRMED', 'PAID', 'SMOKE-EVENT-TXN-001', 'SMOKE-EVENT-QR-001'
    WHERE NOT EXISTS (SELECT 1 FROM event_registrations WHERE event_id = v_event AND student_user_id = v_student);
  END IF;

  -- Helpdesk
  IF v_student IS NOT NULL AND to_regclass('public.helpdesk_tickets') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'helpdesk_tickets' AND column_name = 'subject') THEN
      INSERT INTO helpdesk_tickets (student_user_id, category, subject, description, status, assigned_to_user_id, conversation)
      SELECT v_student, 'IT', 'SMOKE-HELPDESK-001', 'Representative support ticket for smoke testing.', 'PENDING', v_superadmin,
             jsonb_build_array(jsonb_build_object('from', 'student', 'message', 'Smoke ticket opened'))
      WHERE NOT EXISTS (SELECT 1 FROM helpdesk_tickets WHERE student_user_id = v_student AND subject = 'SMOKE-HELPDESK-001');
    END IF;
  END IF;

  -- Placement
  IF to_regclass('public.company_master') IS NOT NULL THEN
    INSERT INTO company_master (tenant_id, company_name, industry, website_url)
    SELECT v_tenant, 'SmokeSoft Labs', 'Software', 'https://example.com/smokesoft'
    WHERE NOT EXISTS (SELECT 1 FROM company_master WHERE tenant_id = v_tenant AND company_name = 'SmokeSoft Labs');
    SELECT company_id INTO v_company FROM company_master WHERE tenant_id = v_tenant AND company_name = 'SmokeSoft Labs' LIMIT 1;
  END IF;

  IF v_company IS NOT NULL AND to_regclass('public.placement_job_descriptions') IS NOT NULL THEN
    INSERT INTO placement_job_descriptions (tenant_id, company_id, title, package_lpa, skills_required, eligibility_criteria, status, min_cgpa, max_active_backlogs, application_deadline)
    SELECT v_tenant, v_company, 'Smoke Software Engineer', 6.50, 'SQL, TypeScript, APIs', 'CGPA >= 7.0', 'OPEN', 7.00, 1, NOW() + INTERVAL '15 days'
    WHERE NOT EXISTS (SELECT 1 FROM placement_job_descriptions WHERE tenant_id = v_tenant AND company_id = v_company AND title = 'Smoke Software Engineer');
    SELECT jd_id INTO v_jd FROM placement_job_descriptions WHERE tenant_id = v_tenant AND company_id = v_company AND title = 'Smoke Software Engineer' LIMIT 1;
  END IF;

  IF v_jd IS NOT NULL AND v_student IS NOT NULL AND to_regclass('public.placement_applications') IS NOT NULL THEN
    INSERT INTO placement_applications (tenant_id, jd_id, student_user_id, cgpa_at_apply, active_backlogs_at_apply, eligibility_status, status)
    SELECT v_tenant, v_jd, v_student, 8.25, 0, 'ELIGIBLE', 'SHORTLISTED'
    WHERE NOT EXISTS (SELECT 1 FROM placement_applications WHERE jd_id = v_jd AND student_user_id = v_student);
  END IF;

  IF to_regclass('public.placement_job_postings') IS NOT NULL THEN
    INSERT INTO placement_job_postings (company_name, role_title, description, ctc_lpa, location, eligibility, one_student_one_job, apply_deadline, status)
    SELECT 'SmokeSoft Labs', 'Smoke Graduate Engineer Trainee', 'Representative ATS posting.', 6.50, 'Jaipur',
           jsonb_build_object('minCgpa', 7, 'skills', jsonb_build_array('SQL', 'TypeScript')),
           true, CURRENT_DATE + 15, 'OPEN'
    WHERE NOT EXISTS (SELECT 1 FROM placement_job_postings WHERE company_name = 'SmokeSoft Labs' AND role_title = 'Smoke Graduate Engineer Trainee');
    SELECT job_id INTO v_job FROM placement_job_postings WHERE company_name = 'SmokeSoft Labs' AND role_title = 'Smoke Graduate Engineer Trainee' LIMIT 1;
  END IF;

  IF v_job IS NOT NULL AND v_student IS NOT NULL AND to_regclass('public.placement_job_applications') IS NOT NULL THEN
    INSERT INTO placement_job_applications (job_id, student_user_id, status, responses)
    SELECT v_job, v_student, 'APPLIED', jsonb_build_object('source', 'smoke-seed')
    WHERE NOT EXISTS (SELECT 1 FROM placement_job_applications WHERE job_id = v_job AND student_user_id = v_student);
  END IF;

  IF v_student IS NOT NULL AND to_regclass('public.student_skill_mappings') IS NOT NULL THEN
    INSERT INTO student_skill_mappings (tenant_id, student_user_id, skill_name, proficiency, verified_by_user_id)
    SELECT v_tenant, v_student, 'Smoke SQL Analytics', 'ADVANCED', v_faculty
    WHERE NOT EXISTS (SELECT 1 FROM student_skill_mappings WHERE tenant_id = v_tenant AND student_user_id = v_student AND skill_name = 'Smoke SQL Analytics');
  END IF;

  -- Alumni
  IF v_student2 IS NOT NULL AND to_regclass('public.alumni_profiles') IS NOT NULL THEN
    INSERT INTO alumni_profiles (alumni_id, tenant_id, student_user_id, name, email, linkedin_url)
    SELECT gen_random_uuid(), v_tenant, v_student2, 'Smoke Alumni', 'smoke.alumni@example.com', 'https://linkedin.com/in/smoke-alumni'
    WHERE NOT EXISTS (SELECT 1 FROM alumni_profiles WHERE tenant_id = v_tenant AND email = 'smoke.alumni@example.com');
    SELECT alumni_id INTO v_alumni FROM alumni_profiles WHERE tenant_id = v_tenant AND email = 'smoke.alumni@example.com' LIMIT 1;
  END IF;

  IF to_regclass('public.alumni_events') IS NOT NULL THEN
    INSERT INTO alumni_events (tenant_id, title, event_date, venue, description, is_published)
    SELECT v_tenant, 'Smoke Alumni Connect', CURRENT_DATE + 25, 'SMOKE Seminar Hall', 'Representative alumni engagement event.', true
    WHERE NOT EXISTS (SELECT 1 FROM alumni_events WHERE tenant_id = v_tenant AND title = 'Smoke Alumni Connect');
  END IF;

  IF v_alumni IS NOT NULL AND v_student IS NOT NULL AND to_regclass('public.alumni_mentorship_activities') IS NOT NULL THEN
    INSERT INTO alumni_mentorship_activities (tenant_id, alumni_id, student_user_id, topic, scheduled_at, status, notes)
    SELECT v_tenant, v_alumni, v_student, 'Smoke career guidance', NOW() + INTERVAL '9 days', 'ACCEPTED', 'Smoke alumni mentorship row'
    WHERE NOT EXISTS (
      SELECT 1 FROM alumni_mentorship_activities WHERE tenant_id = v_tenant AND alumni_id = v_alumni AND student_user_id = v_student AND topic = 'Smoke career guidance'
    );
  END IF;

  -- IQAC / research
  IF to_regclass('public.iqac_document_repository') IS NOT NULL THEN
    INSERT INTO iqac_document_repository (tenant_id, naac_criterion, metric_number, title, file_path, academic_year)
    SELECT v_tenant, 2, '2.3.1', 'SMOKE-NAAC-2.3 Teaching Learning Evidence', '/smoke/iqac/naac-2-3.pdf', '2026-27'
    WHERE NOT EXISTS (SELECT 1 FROM iqac_document_repository WHERE tenant_id = v_tenant AND title = 'SMOKE-NAAC-2.3 Teaching Learning Evidence');
  END IF;

  IF v_faculty IS NOT NULL AND to_regclass('public.faculty_publications') IS NOT NULL THEN
    INSERT INTO faculty_publications (tenant_id, faculty_user_id, title, journal_or_conference, publication_type, indexed_in, doi, publication_date)
    SELECT v_tenant, v_faculty, 'SMOKE: Analytics for Unified Campus Operations', 'Falcon QA Journal', 'JOURNAL', 'Scopus', '10.0000/smoke-campus', CURRENT_DATE - 45
    WHERE NOT EXISTS (SELECT 1 FROM faculty_publications WHERE tenant_id = v_tenant AND title = 'SMOKE: Analytics for Unified Campus Operations');
  END IF;

  IF v_faculty IS NOT NULL AND to_regclass('public.faculty_research_projects') IS NOT NULL THEN
    INSERT INTO faculty_research_projects (tenant_id, principal_investigator_user_id, title, funding_agency, grant_amount, start_date, end_date, status)
    SELECT v_tenant, v_faculty, 'SMOKE Campus Intelligence Research Grant', 'SGVU Internal Seed Fund', 250000, CURRENT_DATE - 30, CURRENT_DATE + 180, 'ONGOING'
    WHERE NOT EXISTS (SELECT 1 FROM faculty_research_projects WHERE tenant_id = v_tenant AND title = 'SMOKE Campus Intelligence Research Grant');
  END IF;

  IF to_regclass('public.accreditation_reports') IS NOT NULL THEN
    INSERT INTO accreditation_reports (tenant_id, report_type, cycle_year, criteria_key, metrics, status, generated_by_user_id)
    SELECT v_tenant, 'NAAC', '2026-27', 'C2', jsonb_build_object('smokeMetric', 87.5), 'GENERATED', v_iqac
    WHERE NOT EXISTS (SELECT 1 FROM accreditation_reports WHERE tenant_id = v_tenant AND report_type = 'NAAC' AND cycle_year = '2026-27' AND criteria_key = 'C2');
  END IF;

  -- Admin ops / fleet / clinic
  IF to_regclass('public.fleet_vehicles') IS NOT NULL THEN
    INSERT INTO fleet_vehicles (tenant_id, registration_no, vehicle_type, route_zone, status)
    SELECT v_tenant, 'RJ14SM0001', 'BUS', 'SMOKE North Route', 'ACTIVE'
    WHERE NOT EXISTS (SELECT 1 FROM fleet_vehicles WHERE tenant_id = v_tenant AND registration_no = 'RJ14SM0001');
  END IF;

  IF to_regclass('public.clinic_visits') IS NOT NULL AND v_student IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clinic_visits' AND column_name = 'chief_complaint') THEN
      INSERT INTO clinic_visits (tenant_id, patient_user_id, chief_complaint, diagnosis, visit_status, visited_at)
      SELECT v_tenant, v_student, 'SMOKE mild fever', 'Observation', 'OPEN', NOW()
      WHERE NOT EXISTS (SELECT 1 FROM clinic_visits WHERE tenant_id = v_tenant AND patient_user_id = v_student AND chief_complaint = 'SMOKE mild fever');
    END IF;
  END IF;
END $$;

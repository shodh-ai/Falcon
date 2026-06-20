-- Smoke data for the Attendance Policy / Exemption workflow QA.
--
-- Covers student3 / student4 QA scenarios (see 20260625150000 for latest seeds):
--   * Student 3  -> 32% attendance, APPROVED medical exemption (HOD approved, proof on file)
--   * Student 4  -> 80% attendance, no exemption (panel hidden on admit card tab)
--   * Student 1/2-> legacy pending HOD samples (optional)
--   * Dept policy-> HOD requested min 70% (PENDING_DEAN)             (Dean acts: /dean/attendance-policy)
--
-- Logins (password123): student3@ / student4@ / hod@ / dev.dean@ / examcell@mygyanvihar.com

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'attendance.exemptions',
  'exam-cell',
  'examcell@mygyanvihar.com',
  'Attendance Policy & Exemptions',
  'Pending HOD / approved exemptions + pending Dean policy change',
  'Student raises exemption; HOD approves or rejects to unlock admit card. HOD requests lower attendance bar; Dean approves.'
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
  v_dept INT;
  v_hod UUID;
  v_course UUID;
  v_student1 UUID;
  v_student2 UUID;
  v_student3 UUID;
BEGIN
  IF to_regclass('public.student_attendance_exemptions') IS NULL THEN
    RAISE NOTICE 'Skipping attendance exemption smoke: tables not found';
    RETURN;
  END IF;

  SELECT tenant_id INTO v_tenant FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  SELECT dept_id INTO v_dept FROM departments WHERE dept_name = 'Computer Science' LIMIT 1;
  SELECT user_id INTO v_hod FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'hod@mygyanvihar.com' LIMIT 1;
  SELECT course_id INTO v_course FROM academic_courses WHERE tenant_id = v_tenant AND course_code = 'SMOKE101' LIMIT 1;
  SELECT user_id INTO v_student1 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student2 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student2@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student3 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student3@mygyanvihar.com' LIMIT 1;

  IF v_tenant IS NULL OR v_dept IS NULL OR v_student1 IS NULL THEN
    RAISE NOTICE 'Skipping attendance exemption smoke: tenant/dept/student1 missing';
    RETURN;
  END IF;

  -- Make sure the HOD owns the department so HOD-scope queries see these students.
  UPDATE departments SET hod_user_id = COALESCE(hod_user_id, v_hod) WHERE dept_id = v_dept;

  -- Place the test students in the HOD's department.
  UPDATE users SET dept_id = v_dept
   WHERE user_id IN (v_student1, v_student2, v_student3) AND user_id IS NOT NULL;

  -- ------------------------------------------------------------------
  -- Low attendance via course enrollments (computeAttendancePercent reads AVG here).
  -- ------------------------------------------------------------------
  IF to_regclass('public.student_course_enrollments') IS NOT NULL THEN
    UPDATE student_course_enrollments SET attendance_percent = 24
     WHERE tenant_id = v_tenant AND student_user_id = v_student1;
    IF NOT FOUND AND v_course IS NOT NULL THEN
      INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, status, attendance_percent)
      VALUES (v_tenant, v_student1, v_course, 4, 'ENROLLED', 24);
    END IF;

    IF v_student2 IS NOT NULL THEN
      UPDATE student_course_enrollments SET attendance_percent = 55
       WHERE tenant_id = v_tenant AND student_user_id = v_student2;
      IF NOT FOUND AND v_course IS NOT NULL THEN
        INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, status, attendance_percent)
        VALUES (v_tenant, v_student2, v_course, 4, 'ENROLLED', 55);
      END IF;
    END IF;

    IF v_student3 IS NOT NULL THEN
      UPDATE student_course_enrollments SET attendance_percent = 30
       WHERE tenant_id = v_tenant AND student_user_id = v_student3;
      IF NOT FOUND AND v_course IS NOT NULL THEN
        INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, status, attendance_percent)
        VALUES (v_tenant, v_student3, v_course, 4, 'ENROLLED', 30);
      END IF;
    END IF;
  END IF;

  -- ------------------------------------------------------------------
  -- Exemption 1: PENDING_HOD (student1, medical, 24%) -> HOD reviews & approves
  -- ------------------------------------------------------------------
  INSERT INTO student_attendance_exemptions (
    exemption_id, tenant_id, student_user_id, reason_category, description,
    supporting_doc_url, attendance_percent_at_request, semester, status, created_at
  )
  VALUES (
    'ae000001-0000-4000-8000-000000000001'::uuid,
    v_tenant, v_student1, 'MEDICAL',
    'SMOKE: Hospitalised for dengue for 5 weeks; attendance dropped to 24%. Medical certificate attached.',
    'https://example.com/evidence/medical-certificate.pdf',
    24, 4, 'PENDING_HOD', NOW() - INTERVAL '2 days'
  )
  ON CONFLICT (exemption_id) DO UPDATE SET
    status = 'PENDING_HOD', hod_user_id = NULL, hod_remarks = NULL, hod_decided_at = NULL,
    final_approver_id = NULL, final_remarks = NULL, final_decided_at = NULL, updated_at = NOW();

  -- ------------------------------------------------------------------
  -- Exemption 2: PENDING_HOD (student2, accident, 55%) -> HOD reviews & approves
  -- ------------------------------------------------------------------
  IF v_student2 IS NOT NULL THEN
    INSERT INTO student_attendance_exemptions (
      exemption_id, tenant_id, student_user_id, reason_category, description,
      supporting_doc_url, attendance_percent_at_request, semester, status, created_at
    )
    VALUES (
      'ae000002-0000-4000-8000-000000000002'::uuid,
      v_tenant, v_student2, 'ACCIDENT',
      'SMOKE: Road accident, bed rest for 4 weeks. Awaiting HOD decision.',
      'https://example.com/evidence/accident-report.pdf',
      55, 4, 'PENDING_HOD', NOW() - INTERVAL '3 days'
    )
    ON CONFLICT (exemption_id) DO UPDATE SET
      status = 'PENDING_HOD', hod_user_id = NULL, hod_remarks = NULL, hod_decided_at = NULL,
      final_approver_id = NULL, final_remarks = NULL, final_decided_at = NULL, updated_at = NOW();
  END IF;

  -- ------------------------------------------------------------------
  -- Exemption 3: APPROVED (student3, internship, 30%) -> admit card already unlocked
  -- ------------------------------------------------------------------
  IF v_student3 IS NOT NULL THEN
    INSERT INTO student_attendance_exemptions (
      exemption_id, tenant_id, student_user_id, reason_category, description,
      supporting_doc_url, attendance_percent_at_request, semester, status,
      hod_user_id, hod_remarks, hod_decided_at,
      final_approver_id, final_remarks, final_decided_at, created_at
    )
    VALUES (
      'ae000003-0000-4000-8000-000000000003'::uuid,
      v_tenant, v_student3, 'INTERNSHIP',
      'SMOKE: Approved industry internship clashing with classes; attendance 30%. Fully approved.',
      'https://example.com/evidence/internship-letter.pdf',
      30, 4, 'APPROVED',
      v_hod, 'SMOKE: Internship approved by department.', NOW() - INTERVAL '5 days',
      v_hod, 'SMOKE: Final approval granted — admit card unlocked.', NOW() - INTERVAL '4 days',
      NOW() - INTERVAL '6 days'
    )
    ON CONFLICT (exemption_id) DO UPDATE SET
      status = 'APPROVED', updated_at = NOW();
  END IF;

  -- ------------------------------------------------------------------
  -- Threshold relaxation: HOD requested min 70% (PENDING_DEAN) -> Dean approves
  -- ------------------------------------------------------------------
  IF v_hod IS NOT NULL THEN
    INSERT INTO attendance_threshold_requests (
      request_id, tenant_id, dept_id, requested_min_percent, reason, status, requested_by, created_at
    )
    VALUES (
      'a7000001-0000-4000-8000-000000000001'::uuid,
      v_tenant, v_dept, 70,
      'SMOKE: Faculty strike + monsoon closures cost ~3 weeks of classes this semester. Requesting min attendance be relaxed from 75% to 70% department-wide.',
      'PENDING_DEAN', v_hod, NOW() - INTERVAL '1 day'
    )
    ON CONFLICT (request_id) DO UPDATE SET
      status = 'PENDING_DEAN', decided_by = NULL, decision_remarks = NULL, decided_at = NULL, updated_at = NOW();
  END IF;

  RAISE NOTICE 'Attendance exemption smoke data seeded';
END $$;

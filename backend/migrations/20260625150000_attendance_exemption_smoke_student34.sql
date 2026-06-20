-- Attendance exemption smoke: student3 (low %, HOD-approved) and student4 (80%, no exemption UI).
-- Logins (password123): student3@mygyanvihar.com / student4@mygyanvihar.com / hod@mygyanvihar.com

UPDATE smoke_seed_manifest
SET
  sample_record = 'Student3 low attendance + HOD-approved exemption; Student4 80% — no exemption request',
  notes = 'Student3 must upload proof to raise request; HOD approves to unlock admit card. Student4 meets attendance bar — exemption panel hidden.',
  seeded_at = NOW()
WHERE smoke_key = 'attendance.exemptions';

DO $$
DECLARE
  v_tenant UUID;
  v_dept INT;
  v_hod UUID;
  v_course UUID;
  v_student3 UUID;
  v_student4 UUID;
BEGIN
  IF to_regclass('public.student_attendance_exemptions') IS NULL THEN
    RAISE NOTICE 'Skipping student3/4 attendance smoke: tables not found';
    RETURN;
  END IF;

  SELECT tenant_id INTO v_tenant FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  SELECT dept_id INTO v_dept FROM departments WHERE dept_name = 'Computer Science' LIMIT 1;
  SELECT user_id INTO v_hod FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'hod@mygyanvihar.com' LIMIT 1;
  SELECT course_id INTO v_course FROM academic_courses WHERE tenant_id = v_tenant AND course_code = 'SMOKE101' LIMIT 1;
  SELECT user_id INTO v_student3 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student3@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student4 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student4@mygyanvihar.com' LIMIT 1;

  IF v_tenant IS NULL OR v_student3 IS NULL THEN
    RAISE NOTICE 'Skipping student3/4 attendance smoke: tenant or student3 missing';
    RETURN;
  END IF;

  IF v_dept IS NOT NULL THEN
    UPDATE departments SET hod_user_id = COALESCE(hod_user_id, v_hod) WHERE dept_id = v_dept;
    UPDATE users SET dept_id = v_dept
     WHERE user_id IN (v_student3, v_student4) AND user_id IS NOT NULL;
  END IF;

  IF to_regclass('public.student_course_enrollments') IS NOT NULL AND v_course IS NOT NULL THEN
    -- Student 3: 32% attendance (below 75% bar)
    UPDATE student_course_enrollments SET attendance_percent = 32
     WHERE tenant_id = v_tenant AND student_user_id = v_student3;
    IF NOT FOUND THEN
      INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, status, attendance_percent)
      VALUES (v_tenant, v_student3, v_course, 4, 'ENROLLED', 32);
    END IF;

    -- Student 4: 80% attendance (meets bar — no exemption request)
    IF v_student4 IS NOT NULL THEN
      UPDATE student_course_enrollments SET attendance_percent = 80
       WHERE tenant_id = v_tenant AND student_user_id = v_student4;
      IF NOT FOUND THEN
        INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, status, attendance_percent)
        VALUES (v_tenant, v_student4, v_course, 4, 'ENROLLED', 80);
      END IF;
    END IF;
  END IF;

  -- Student 3: HOD-approved medical exemption with proof on file
  INSERT INTO student_attendance_exemptions (
    exemption_id, tenant_id, student_user_id, reason_category, description,
    supporting_doc_url, attendance_percent_at_request, semester, status,
    hod_user_id, hod_remarks, hod_decided_at, created_at
  )
  VALUES (
    'ae000003-0000-4000-8000-000000000003'::uuid,
    v_tenant, v_student3, 'MEDICAL',
    'SMOKE: Prolonged illness; attendance 32%. Medical certificate uploaded and verified by HOD.',
    'https://example.com/evidence/student3-medical-certificate.pdf',
    32, 4, 'APPROVED',
    v_hod, 'SMOKE: Medical documents verified. Approved for admit card.', NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '4 days'
  )
  ON CONFLICT (exemption_id) DO UPDATE SET
    reason_category = 'MEDICAL',
    description = EXCLUDED.description,
    supporting_doc_url = EXCLUDED.supporting_doc_url,
    attendance_percent_at_request = 32,
    status = 'APPROVED',
    hod_user_id = v_hod,
    hod_remarks = EXCLUDED.hod_remarks,
    hod_decided_at = NOW() - INTERVAL '2 days',
    updated_at = NOW();

  -- Student 4: no exemption records
  IF v_student4 IS NOT NULL THEN
    DELETE FROM student_attendance_exemptions
     WHERE tenant_id = v_tenant AND student_user_id = v_student4;
  END IF;

  RAISE NOTICE 'Attendance exemption smoke updated for student3 (approved) and student4 (80%%)';
END $$;

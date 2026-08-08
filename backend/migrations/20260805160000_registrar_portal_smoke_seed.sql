-- Registrar Portal smoke seed (idempotent) — tenant sgvu
-- Login: registrar@mygyanvihar.com / password123
-- Populates desks: placement/lifecycle, certificates, petitions, legal, appointments,
-- governance, enrollment queue, semester regs, degree eligibility, student docs, tickets.

DO $$
DECLARE
  v_tenant UUID := 'a0000000-0000-4000-8000-000000000001';
  v_reg UUID;
  v_s1 UUID;
  v_s2 UUID;
  v_s3 UUID;
  v_s4 UUID;
  v_s5 UUID;
  v_s6 UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE tenant_id = v_tenant AND subdomain = 'sgvu') THEN
    RAISE NOTICE 'registrar smoke seed skipped — sgvu tenant missing';
    RETURN;
  END IF;

  SELECT user_id INTO v_reg FROM users
  WHERE tenant_id = v_tenant AND lower(official_email) = 'registrar@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_s1 FROM users
  WHERE tenant_id = v_tenant AND lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_s2 FROM users
  WHERE tenant_id = v_tenant AND lower(official_email) = 'student3@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_s3 FROM users
  WHERE tenant_id = v_tenant AND lower(official_email) = 'student4@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_s4 FROM users
  WHERE tenant_id = v_tenant AND lower(official_email) = 'student5@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_s5 FROM users
  WHERE tenant_id = v_tenant AND lower(official_email) = 'student6@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_s6 FROM users
  WHERE tenant_id = v_tenant AND lower(official_email) = 'student7@mygyanvihar.com' LIMIT 1;

  IF v_reg IS NULL OR v_s1 IS NULL THEN
    RAISE NOTICE 'registrar smoke seed skipped — registrar/student personas missing';
    RETURN;
  END IF;

  v_s2 := COALESCE(v_s2, v_s1);
  v_s3 := COALESCE(v_s3, v_s1);
  v_s4 := COALESCE(v_s4, v_s1);
  v_s5 := COALESCE(v_s5, v_s1);
  v_s6 := COALESCE(v_s6, v_s1);

  -- ── Student academic placement + lifecycle ───────────────────────────────
  UPDATE student_profiles sp SET
    tenant_id = COALESCE(sp.tenant_id, v_tenant),
    school_name = 'School of Engineering',
    program_name = COALESCE(NULLIF(BTRIM(sp.program_name), ''), 'B.Tech Computer Science'),
    degree_name = COALESCE(NULLIF(BTRIM(sp.degree_name), ''), 'B.Tech'),
    batch = COALESCE(NULLIF(BTRIM(sp.batch), ''), '2023-27'),
    current_semester = COALESCE(sp.current_semester, 6),
    section_code = COALESCE(NULLIF(BTRIM(sp.section_code), ''), 'A'),
    advisor_name = COALESCE(NULLIF(BTRIM(sp.advisor_name), ''), 'Dr. Anita Sharma'),
    lifecycle_status = COALESCE(NULLIF(BTRIM(sp.lifecycle_status), ''), 'ACTIVE'),
    status = COALESCE(NULLIF(BTRIM(sp.status), ''), 'ACTIVE'),
    enrollment_no = COALESCE(NULLIF(BTRIM(sp.enrollment_no), ''), 'SGVU-2026-1001'),
    enrollment_number = COALESCE(NULLIF(BTRIM(sp.enrollment_number), ''), COALESCE(NULLIF(BTRIM(sp.enrollment_no), ''), 'SGVU-2026-1001')),
    prn_number = COALESCE(NULLIF(BTRIM(sp.prn_number), ''), COALESCE(NULLIF(BTRIM(sp.enrollment_no), ''), 'SGVU-2026-1001')),
    updated_at = NOW()
  WHERE sp.user_id = v_s1;

  UPDATE student_profiles sp SET
    tenant_id = COALESCE(sp.tenant_id, v_tenant),
    school_name = 'School of Engineering',
    program_name = 'B.Tech Computer Science',
    degree_name = 'B.Tech',
    batch = '2022-26',
    current_semester = 8,
    section_code = 'B',
    advisor_name = 'Dr. Vikram Mehta',
    lifecycle_status = 'ACTIVE',
    status = 'ACTIVE',
    updated_at = NOW()
  WHERE sp.user_id = v_s2;

  UPDATE student_profiles sp SET
    tenant_id = COALESCE(sp.tenant_id, v_tenant),
    school_name = 'School of Management',
    program_name = 'MBA',
    degree_name = 'MBA',
    batch = '2024-26',
    current_semester = 3,
    section_code = 'A',
    advisor_name = 'Prof. Neha Gupta',
    lifecycle_status = 'ON_LEAVE',
    status = 'ON_LEAVE',
    updated_at = NOW()
  WHERE sp.user_id = v_s3;

  UPDATE student_profiles sp SET
    tenant_id = COALESCE(sp.tenant_id, v_tenant),
    school_name = 'School of Engineering',
    program_name = 'B.Tech ECE',
    degree_name = 'B.Tech',
    batch = '2021-25',
    current_semester = 8,
    section_code = 'C',
    advisor_name = 'Dr. Ravi Joshi',
    lifecycle_status = 'GRADUATED',
    status = 'GRADUATED',
    updated_at = NOW()
  WHERE sp.user_id = v_s4;

  DELETE FROM registrar_placement_history
  WHERE tenant_id = v_tenant AND remarks = 'SMOKE_SEED';
  INSERT INTO registrar_placement_history (
    history_id, tenant_id, student_user_id, school_name, department_name, program_name,
    degree_name, batch, semester, section_code, advisor_name, changed_by, change_source, remarks
  ) VALUES
    ('f8000001-0000-4000-8000-000000000001', v_tenant, v_s1, 'School of Engineering', 'Computer Science', 'B.Tech Computer Science', 'B.Tech', '2023-27', 6, 'A', 'Dr. Anita Sharma', v_reg, 'MANUAL', 'SMOKE_SEED'),
    ('f8000001-0000-4000-8000-000000000002', v_tenant, v_s2, 'School of Engineering', 'Computer Science', 'B.Tech Computer Science', 'B.Tech', '2022-26', 8, 'B', 'Dr. Vikram Mehta', v_reg, 'ENROLLMENT', 'SMOKE_SEED'),
    ('f8000001-0000-4000-8000-000000000003', v_tenant, v_s3, 'School of Management', 'MBA', 'MBA', 'MBA', '2024-26', 3, 'A', 'Prof. Neha Gupta', v_reg, 'MANUAL', 'SMOKE_SEED');

  DELETE FROM registrar_lifecycle_history
  WHERE tenant_id = v_tenant AND remarks = 'SMOKE_SEED';
  INSERT INTO registrar_lifecycle_history (
    history_id, tenant_id, student_user_id, from_status, to_status, remarks, changed_by
  ) VALUES
    ('f8000002-0000-4000-8000-000000000001', v_tenant, v_s1, 'ENROLLED', 'ACTIVE', 'SMOKE_SEED', v_reg),
    ('f8000002-0000-4000-8000-000000000002', v_tenant, v_s3, 'ACTIVE', 'ON_LEAVE', 'SMOKE_SEED', v_reg),
    ('f8000002-0000-4000-8000-000000000003', v_tenant, v_s4, 'ACTIVE', 'GRADUATED', 'SMOKE_SEED', v_reg);

  -- ── Certificates (workflow mix) ──────────────────────────────────────────
  INSERT INTO registrar_certificate_requests (
    request_id, tenant_id, student_user_id, certificate_type, status, remarks,
    pdf_url, signed_at, signed_by, issued_at, issued_by, verification_code, created_at, updated_at
  ) VALUES
    ('f8000010-0000-4000-8000-000000000001', v_tenant, v_s1, 'BONAFIDE', 'DRAFT',
     'SMOKE_SEED — visa bonafide', NULL, NULL, NULL, NULL, NULL, NULL, NOW() - INTERVAL '2 days', NOW()),
    ('f8000010-0000-4000-8000-000000000002', v_tenant, v_s2, 'TRANSCRIPT', 'GENERATED',
     'SMOKE_SEED — ready to attest',
     '/api/admin/registrar-desk/certificates/f8000010-0000-4000-8000-000000000002/pdf',
     NULL, NULL, NULL, NULL, NULL, NOW() - INTERVAL '1 day', NOW()),
    ('f8000010-0000-4000-8000-000000000003', v_tenant, v_s3, 'CHARACTER', 'SIGNED',
     'SMOKE_SEED — attested, ready to issue',
     '/api/admin/registrar-desk/certificates/f8000010-0000-4000-8000-000000000003/pdf',
     NOW() - INTERVAL '3 hours', v_reg, NULL, NULL, NULL, NOW() - INTERVAL '20 hours', NOW()),
    ('f8000010-0000-4000-8000-000000000004', v_tenant, v_s4, 'PROVISIONAL', 'ISSUED',
     'SMOKE_SEED — issued provisional',
     '/api/admin/registrar-desk/certificates/f8000010-0000-4000-8000-000000000004/pdf',
     NOW() - INTERVAL '2 days', v_reg, NOW() - INTERVAL '1 day', v_reg, 'SMOKEPROV0001ABCD',
     NOW() - INTERVAL '5 days', NOW()),
    ('f8000010-0000-4000-8000-000000000005', v_tenant, v_s5, 'MIGRATION', 'GENERATED',
     'SMOKE_SEED — migration draft generated',
     '/api/admin/registrar-desk/certificates/f8000010-0000-4000-8000-000000000005/pdf',
     NULL, NULL, NULL, NULL, NULL, NOW() - INTERVAL '6 hours', NOW())
  ON CONFLICT (request_id) DO UPDATE SET
    status = EXCLUDED.status,
    remarks = EXCLUDED.remarks,
    pdf_url = EXCLUDED.pdf_url,
    verification_code = COALESCE(EXCLUDED.verification_code, registrar_certificate_requests.verification_code),
    updated_at = NOW();

  -- ── Petitions ────────────────────────────────────────────────────────────
  INSERT INTO registrar_petitions (
    petition_id, tenant_id, petition_type, student_user_id, student_name, enrollment_no,
    current_value, requested_value, reason, status, documents_json, created_by, created_at, updated_at
  ) VALUES
    ('f8000020-0000-4000-8000-000000000001', v_tenant, 'NAME_CORRECTION', v_s1, 'Student One', 'SGVU-2026-1001',
     'Student One', 'Student One Sharma', 'Aadhaar spelling mismatch — SMOKE_SEED',
     'PENDING',
     '[{"name":"aadhaar-copy.pdf","url":"https://example.com/smoke/aadhaar.pdf"}]'::jsonb,
     v_reg, NOW() - INTERVAL '1 day', NOW()),
    ('f8000020-0000-4000-8000-000000000002', v_tenant, 'COURSE_CHANGE', v_s2, 'Student Three', 'SGVU-2026-2001',
     'B.Tech Computer Science', 'B.Tech Information Technology', 'Elective stream change — SMOKE_SEED',
     'PENDING', '[]'::jsonb, v_reg, NOW() - INTERVAL '10 hours', NOW()),
    ('f8000020-0000-4000-8000-000000000003', v_tenant, 'TRANSFER_CERTIFICATE', v_s5, 'Student Six', 'SGVU-2026-2004',
     NULL, 'TC for transfer to another university', 'Parent relocation — SMOKE_SEED',
     'PENDING',
     '[{"name":"transfer-request.pdf","url":"https://example.com/smoke/tc.pdf"}]'::jsonb,
     v_reg, NOW() - INTERVAL '4 hours', NOW()),
    ('f8000020-0000-4000-8000-000000000004', v_tenant, 'MIGRATION_CERTIFICATE', v_s6, 'Student Seven', 'SGVU-2026-2005',
     NULL, 'Migration certificate for PG admission', 'SMOKE_SEED',
     'APPROVED', '[]'::jsonb, v_reg, NOW() - INTERVAL '3 days', NOW())
  ON CONFLICT (petition_id) DO UPDATE SET
    status = EXCLUDED.status,
    reason = EXCLUDED.reason,
    documents_json = EXCLUDED.documents_json,
    updated_at = NOW();

  -- ── Legal & RTI ──────────────────────────────────────────────────────────
  INSERT INTO registrar_rti_requests (
    rti_id, tenant_id, reference_no, applicant_name, subject, department, status,
    due_date, assigned_to, reply_summary, created_by, created_at, updated_at
  ) VALUES
    ('f8000030-0000-4000-8000-000000000001', v_tenant, 'RTI/SGVU/2026/014', 'Amit Verma',
     'Fee structure copies for B.Tech 2025–26 — SMOKE_SEED', 'Finance', 'OPEN',
     CURRENT_DATE + 12, 'PIO — Registrar Office', NULL, v_reg, NOW() - INTERVAL '2 days', NOW()),
    ('f8000030-0000-4000-8000-000000000002', v_tenant, 'RTI/SGVU/2026/009', 'Priya Nair',
     'Hostel allotment waitlist criteria — SMOKE_SEED', 'Hostel', 'IN_PROGRESS',
     CURRENT_DATE + 5, 'Dy. Registrar', 'Draft reply under review', v_reg, NOW() - INTERVAL '8 days', NOW())
  ON CONFLICT (rti_id) DO UPDATE SET
    status = EXCLUDED.status,
    subject = EXCLUDED.subject,
    updated_at = NOW();

  INSERT INTO registrar_court_cases (
    case_id, tenant_id, case_number, title, court_name, status, next_hearing, counsel, created_at, updated_at
  ) VALUES
    ('f8000031-0000-4000-8000-000000000001', v_tenant, 'CWP/4421/2025',
     'Service matter — faculty regularization (SMOKE_SEED)', 'Rajasthan High Court',
     'ACTIVE', CURRENT_DATE + 21, 'Adv. Mehta & Associates', NOW() - INTERVAL '30 days', NOW()),
    ('f8000031-0000-4000-8000-000000000002', v_tenant, 'CS/118/2026',
     'Fee refund dispute — alumni batch 2024 (SMOKE_SEED)', 'District Court Jaipur',
     'ACTIVE', CURRENT_DATE + 40, 'University Counsel', NOW() - INTERVAL '12 days', NOW())
  ON CONFLICT (case_id) DO UPDATE SET
    status = EXCLUDED.status,
    next_hearing = EXCLUDED.next_hearing,
    updated_at = NOW();

  INSERT INTO registrar_legal_notices (
    notice_id, tenant_id, notice_number, title, party, status, due_date, created_at, updated_at
  ) VALUES
    ('f8000032-0000-4000-8000-000000000001', v_tenant, 'LN/SGVU/2026/03',
     'Show-cause — vendor SLA breach (SMOKE_SEED)', 'Campus Mess Contractor', 'OPEN',
     CURRENT_DATE + 7, NOW() - INTERVAL '3 days', NOW())
  ON CONFLICT (notice_id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW();

  INSERT INTO registrar_disciplinary_cases (
    case_id, tenant_id, case_number, student_name, allegation, status, committee, created_at, updated_at
  ) VALUES
    ('f8000033-0000-4000-8000-000000000001', v_tenant, 'DC/2026/07',
     'Student Five', 'Examination malpractice allegation — SMOKE_SEED', 'OPEN',
     'Examination Discipline Committee', NOW() - INTERVAL '5 days', NOW())
  ON CONFLICT (case_id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW();

  -- ── Staff appointments ───────────────────────────────────────────────────
  INSERT INTO registrar_staff_appointments (
    appointment_id, tenant_id, employee_id, candidate_name, position, department,
    joining_date, salary_package, recruitment_status, verification_status, workflow_stage,
    reporting_manager, email, phone, salary_json, checklist_json, letter_status, remarks,
    created_at, updated_at
  ) VALUES
    ('f8000040-0000-4000-8000-000000000001', v_tenant, 'SGVU-FAC-SMOKE-01', 'Dr. Kavya Reddy',
     'Assistant Professor', 'Computer Science', CURRENT_DATE + 14, '₹9.6 LPA',
     'Selected', 'Pending', 'Registrar', 'Dean Engineering',
     'kavya.reddy.smoke@example.com', '9876501001',
     '{"basic":48000,"hra":19200,"special":12800}'::jsonb,
     '[{"label":"Degree certificates","status":"Pending"},{"label":"Police verification","status":"Pending"}]'::jsonb,
     'DRAFT', 'SMOKE_SEED — pending document verify', NOW() - INTERVAL '2 days', NOW()),
    ('f8000040-0000-4000-8000-000000000002', v_tenant, 'SGVU-FAC-SMOKE-02', 'Mr. Rohan Kapoor',
     'Lab Instructor', 'Electronics', CURRENT_DATE + 7, '₹4.8 LPA',
     'Offer Extended', 'Verified', 'Registrar', 'HOD ECE',
     'rohan.kapoor.smoke@example.com', '9876501002',
     '{"basic":28000,"hra":11200}'::jsonb,
     '[{"label":"Degree certificates","status":"Verified"},{"label":"Medical fitness","status":"Verified"}]'::jsonb,
     'DRAFT', 'SMOKE_SEED — ready to Sign & issue', NOW() - INTERVAL '5 days', NOW()),
    ('f8000040-0000-4000-8000-000000000003', v_tenant, 'SGVU-ADM-SMOKE-03', 'Ms. Sneha Iyer',
     'Assistant Registrar', 'Registrar Office', CURRENT_DATE - 10, '₹7.2 LPA',
     'Offer Extended', 'Verified', 'Appointment Issued', 'University Registrar',
     'sneha.iyer.smoke@example.com', '9876501003',
     '{"basic":36000,"hra":14400}'::jsonb,
     '[{"label":"Experience certificates","status":"Verified"}]'::jsonb,
     'ISSUED', 'SMOKE_SEED — letter issued', NOW() - INTERVAL '20 days', NOW())
  ON CONFLICT (appointment_id) DO UPDATE SET
    recruitment_status = EXCLUDED.recruitment_status,
    verification_status = EXCLUDED.verification_status,
    letter_status = EXCLUDED.letter_status,
    remarks = EXCLUDED.remarks,
    updated_at = NOW();

  DELETE FROM registrar_appointment_activity
  WHERE tenant_id = v_tenant AND event LIKE 'SMOKE_SEED%';
  INSERT INTO registrar_appointment_activity (activity_id, tenant_id, appointment_id, event, actor)
  VALUES
    ('f8000041-0000-4000-8000-000000000001', v_tenant, 'f8000040-0000-4000-8000-000000000001', 'SMOKE_SEED — Appointment created', 'University Registrar'),
    ('f8000041-0000-4000-8000-000000000002', v_tenant, 'f8000040-0000-4000-8000-000000000002', 'SMOKE_SEED — Documents verified', 'University Registrar'),
    ('f8000041-0000-4000-8000-000000000003', v_tenant, 'f8000040-0000-4000-8000-000000000002', 'SMOKE_SEED — Appointment approved', 'University Registrar'),
    ('f8000041-0000-4000-8000-000000000004', v_tenant, 'f8000040-0000-4000-8000-000000000003', 'SMOKE_SEED — Letter signed & issued', 'University Registrar');

  -- ── Governance tasks ─────────────────────────────────────────────────────
  INSERT INTO registrar_governance_tasks (
    task_id, tenant_id, title, category, body, status, priority, due_date, owner_name, created_by, created_at, updated_at
  ) VALUES
    ('f8000050-0000-4000-8000-000000000001', v_tenant, 'Academic Council — Aug 2026 agenda pack',
     'ACADEMIC_COUNCIL', 'Compile ordinance amendments and new program proposals — SMOKE_SEED',
     'PENDING', 'HIGH', CURRENT_DATE + 4, 'University Registrar', v_reg, NOW() - INTERVAL '1 day', NOW()),
    ('f8000050-0000-4000-8000-000000000002', v_tenant, 'Circular: Semester registration window',
     'CIRCULAR', 'Notify schools of Sem-7 registration dates — SMOKE_SEED',
     'PENDING', 'MEDIUM', CURRENT_DATE + 2, 'Dy. Registrar Academics', v_reg, NOW() - INTERVAL '6 hours', NOW()),
    ('f8000050-0000-4000-8000-000000000003', v_tenant, 'Executive Council minutes — July',
     'EXECUTIVE_COUNCIL', 'Upload signed minutes to vault — SMOKE_SEED',
     'APPROVED', 'LOW', CURRENT_DATE - 3, 'University Registrar', v_reg, NOW() - INTERVAL '10 days', NOW())
  ON CONFLICT (task_id) DO UPDATE SET
    status = EXCLUDED.status,
    body = EXCLUDED.body,
    updated_at = NOW();

  -- ── Enrollment queue leads ───────────────────────────────────────────────
  INSERT INTO admissions_leads (
    lead_id, full_name, email, phone, stage, source, metadata, tenant_id, lead_score, created_at, updated_at
  ) VALUES
    ('f8000060-0000-4000-8000-000000000001', 'Aarav Malhotra', 'aarav.malhotra.smoke@example.com', '9000010001',
     'FEE_PAID', 'SMOKE_SEED',
     '{"fee_paid":true,"fee_verified":true,"preferred_program":"B.Tech CSE"}'::jsonb,
     v_tenant, 88, NOW() - INTERVAL '2 days', NOW()),
    ('f8000060-0000-4000-8000-000000000002', 'Ishita Banerjee', 'ishita.banerjee.smoke@example.com', '9000010002',
     'OFFERED', 'SMOKE_SEED',
     '{"fee_paid":false,"preferred_program":"MBA"}'::jsonb,
     v_tenant, 72, NOW() - INTERVAL '1 day', NOW()),
    ('f8000060-0000-4000-8000-000000000003', 'Kabir Singh', 'kabir.singh.smoke@example.com', '9000010003',
     'FEE_PAID', 'SMOKE_SEED',
     '{"fee_verified":true,"preferred_program":"B.Tech ECE","queue":"document_check"}'::jsonb,
     v_tenant, 81, NOW() - INTERVAL '8 hours', NOW())
  ON CONFLICT (lead_id) DO UPDATE SET
    stage = EXCLUDED.stage,
    metadata = EXCLUDED.metadata,
    source = EXCLUDED.source,
    updated_at = NOW();

  INSERT INTO registrar_enrollment_runs (
    run_id, tenant_id, lead_id, student_user_id, enrollment_no, prn_number, fee_verified,
    program_name, department_name, school_name, batch, semester, section_code, degree_name,
    status, enrolled_by, remarks, created_at
  ) VALUES
    ('f8000061-0000-4000-8000-000000000001', v_tenant, NULL, v_s1, 'SGVU-2026-1001', 'SGVU-2026-1001', true,
     'B.Tech Computer Science', 'Computer Science', 'School of Engineering', '2023-27', 1, 'A', 'B.Tech',
     'COMPLETED', v_reg, 'SMOKE_SEED — historical enroll', NOW() - INTERVAL '400 days')
  ON CONFLICT (run_id) DO NOTHING;

  -- ── Semester registrations ───────────────────────────────────────────────
  INSERT INTO exam_semester_registrations (
    registration_id, tenant_id, student_user_id, semester, fee_status, eligibility_snapshot,
    status, registrar_remarks, created_at
  ) VALUES
    ('f8000070-0000-4000-8000-000000000001', v_tenant, v_s1, 6, 'PAID',
     '{"program":"B.Tech CSE","smoke":true}'::jsonb, 'SUBMITTED', NULL, NOW() - INTERVAL '2 days'),
    ('f8000070-0000-4000-8000-000000000002', v_tenant, v_s2, 8, 'PAID',
     '{"program":"B.Tech CSE","smoke":true}'::jsonb, 'PENDING', NULL, NOW() - INTERVAL '1 day'),
    ('f8000070-0000-4000-8000-000000000003', v_tenant, v_s3, 3, 'PENDING',
     '{"program":"MBA","smoke":true}'::jsonb, 'SENT_BACK', 'Fee clearance pending — SMOKE_SEED', NOW() - INTERVAL '5 days')
  ON CONFLICT (registration_id) DO UPDATE SET
    status = EXCLUDED.status,
    fee_status = EXCLUDED.fee_status,
    registrar_remarks = EXCLUDED.registrar_remarks;

  -- ── Degree eligibility ───────────────────────────────────────────────────
  INSERT INTO degree_eligibility_audits (
    audit_id, tenant_id, student_user_id, credits_required, credits_earned, cgpa_required, cgpa_earned,
    pending_backlogs, library_clearance, finance_clearance, hostel_clearance, examination_clearance,
    final_status, checked_by, registrar_decision, checked_at
  ) VALUES
    ('f8000080-0000-4000-8000-000000000001', v_tenant, v_s4, 160, 168, 5.00, 7.85,
     0, true, true, true, true, 'ELIGIBLE', v_reg, 'PENDING', NOW() - INTERVAL '1 day'),
    ('f8000080-0000-4000-8000-000000000002', v_tenant, v_s2, 160, 152, 5.00, 6.40,
     1, true, false, true, true, 'NOT_ELIGIBLE', v_reg, 'PENDING', NOW() - INTERVAL '3 days'),
    ('f8000080-0000-4000-8000-000000000003', v_tenant, v_s1, 160, 120, 5.00, 7.10,
     0, true, true, true, false, 'PENDING', v_reg, 'PENDING', NOW() - INTERVAL '6 hours')
  ON CONFLICT (audit_id) DO UPDATE SET
    credits_earned = EXCLUDED.credits_earned,
    final_status = EXCLUDED.final_status,
    registrar_decision = EXCLUDED.registrar_decision,
    checked_at = EXCLUDED.checked_at;

  -- ── Student document vault ───────────────────────────────────────────────
  DELETE FROM student_documents
  WHERE tenant_id = v_tenant AND title LIKE 'SMOKE_SEED%';
  INSERT INTO student_documents (document_id, tenant_id, student_user_id, category, title, file_url)
  VALUES
    ('f8000090-0000-4000-8000-000000000001', v_tenant, v_s1, 'IDENTITY', 'SMOKE_SEED — Aadhaar',
     'https://example.com/smoke/student1-aadhaar.pdf'),
    ('f8000090-0000-4000-8000-000000000002', v_tenant, v_s1, 'ACADEMIC', 'SMOKE_SEED — 12th Marksheet',
     'https://example.com/smoke/student1-12th.pdf'),
    ('f8000090-0000-4000-8000-000000000003', v_tenant, v_s2, 'IDENTITY', 'SMOKE_SEED — PAN',
     'https://example.com/smoke/student3-pan.pdf');

  -- ── Profile correction tickets ───────────────────────────────────────────
  INSERT INTO helpdesk_tickets (
    ticket_id, student_user_id, category, subject, description, status, tenant_id, ticket_ref, created_at, updated_at
  ) VALUES
    ('f80000a0-0000-4000-8000-000000000001', v_s1, 'STUDENT_PROFILE',
     'Correct father name spelling',
     'Please unlock profile to correct father name as per Aadhaar. SMOKE_SEED',
     'PENDING', v_tenant, 'PRF-SMOKE-01', NOW() - INTERVAL '1 day', NOW()),
    ('f80000a0-0000-4000-8000-000000000002', v_s3, 'STUDENT_PROFILE',
     'Update permanent address',
     'Relocated to Jaipur — need address edit window. SMOKE_SEED',
     'PENDING', v_tenant, 'PRF-SMOKE-02', NOW() - INTERVAL '5 hours', NOW())
  ON CONFLICT (ticket_id) DO UPDATE SET
    status = EXCLUDED.status,
    description = EXCLUDED.description,
    updated_at = NOW();

  -- ── DSC smoke attestation (metadata + tiny signature image; not Class-3 crypto) ─
  INSERT INTO registrar_dsc_credentials (
    credential_id, tenant_id, owner_user_id, owner_name, certificate_name, certificate_authority,
    serial_number, valid_from, expiry_date, status, issued_by, signature_image_url, last_used_at,
    created_at, updated_at
  ) VALUES (
    'f80000b0-0000-4000-8000-000000000001', v_tenant, v_reg,
    'University Registrar',
    'SMOKE Registrar Attestation Profile',
    'SMOKE Local CA (not Class-3)',
    'SMOKE-DSC-2026-0001',
    CURRENT_DATE - 30,
    CURRENT_DATE + 335,
    'CONNECTED',
    'Falcon IT Smoke',
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    NOW() - INTERVAL '1 day',
    NOW(), NOW()
  )
  ON CONFLICT (tenant_id, owner_user_id) DO UPDATE SET
    certificate_name = EXCLUDED.certificate_name,
    certificate_authority = EXCLUDED.certificate_authority,
    serial_number = EXCLUDED.serial_number,
    expiry_date = EXCLUDED.expiry_date,
    status = EXCLUDED.status,
    signature_image_url = EXCLUDED.signature_image_url,
    updated_at = NOW();

  DELETE FROM registrar_signing_history
  WHERE tenant_id = v_tenant AND document_label LIKE 'SMOKE_SEED%';
  INSERT INTO registrar_signing_history (
    sign_id, tenant_id, document_label, action, status, signed_by, signed_by_name, created_at
  ) VALUES
    ('f80000b1-0000-4000-8000-000000000001', v_tenant, 'SMOKE_SEED — Provisional certificate',
     'Signature image attestation', 'COMPLETED', v_reg, 'University Registrar', NOW() - INTERVAL '1 day'),
    ('f80000b1-0000-4000-8000-000000000002', v_tenant, 'SMOKE_SEED — Appointment letter',
     'Signature image attestation', 'COMPLETED', v_reg, 'University Registrar', NOW() - INTERVAL '20 days');

  RAISE NOTICE 'registrar portal smoke seed applied for tenant %', v_tenant;
END $$;

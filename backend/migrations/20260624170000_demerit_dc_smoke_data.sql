-- Smoke data for Student Demerit Point System / DC portal QA.

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'disciplinary-committee.demerits',
  'disciplinary-committee',
  'dc.member@mygyanvihar.com',
  'Demerit Point System',
  'Pending / approved / rejected incidents + subject-back threshold',
  'Faculty submits; DC approves. Login dc.member@mygyanvihar.com or faculty1@mygyanvihar.com → /faculty/discipline/incidents.'
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
  v_dc_role INT;
  v_faculty UUID;
  v_student1 UUID;
  v_student2 UUID;
  v_student3 UUID;
  v_dc UUID;
  v_course UUID;
  v_pwd TEXT := '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO';
BEGIN
  IF to_regclass('public.demerit_incidents') IS NULL THEN
    RAISE NOTICE 'Skipping demerit smoke: demerit_incidents not found';
    RETURN;
  END IF;

  SELECT tenant_id INTO v_tenant FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  SELECT role_id INTO v_dc_role FROM roles WHERE role_name = 'DC_MEMBER' LIMIT 1;
  SELECT user_id INTO v_faculty FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student1 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student2 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student2@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student3 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student3@mygyanvihar.com' LIMIT 1;
  SELECT course_id INTO v_course FROM academic_courses WHERE tenant_id = v_tenant AND course_code = 'SMOKE101' LIMIT 1;

  IF v_tenant IS NULL OR v_dc_role IS NULL OR v_faculty IS NULL OR v_course IS NULL THEN
    RAISE NOTICE 'Skipping demerit smoke: tenant, role, faculty, or SMOKE101 missing';
    RETURN;
  END IF;

  -- DC member persona
  INSERT INTO users (user_id, tenant_id, name, official_email, role_id, password_hash, is_active, onboarding_status)
  VALUES (
    'd1000001-0000-4000-8000-000000000001'::uuid,
    v_tenant,
    'DC Member One',
    'dc.member@mygyanvihar.com',
    v_dc_role,
    v_pwd,
    TRUE,
    'COMPLETED'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    role_id = EXCLUDED.role_id,
    is_active = TRUE,
    onboarding_status = 'COMPLETED';

  SELECT user_id INTO v_dc FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'dc.member@mygyanvihar.com' LIMIT 1;

  IF to_regclass('public.user_roles') IS NOT NULL AND v_dc IS NOT NULL THEN
    INSERT INTO user_roles (user_id, role_id, is_primary)
    VALUES (v_dc, v_dc_role, TRUE)
    ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = TRUE;
  END IF;

  -- Summaries: student2 at 4 points (approve pending 2 → subject back), student3 already subject back
  IF v_student2 IS NOT NULL THEN
    INSERT INTO student_academic_summaries (tenant_id, student_user_id, cumulative_demerit_points, is_subject_back_triggered)
    VALUES (v_tenant, v_student2, 4, FALSE)
    ON CONFLICT (tenant_id, student_user_id) DO UPDATE SET
      cumulative_demerit_points = EXCLUDED.cumulative_demerit_points,
      is_subject_back_triggered = EXCLUDED.is_subject_back_triggered,
      updated_at = NOW();
  END IF;

  IF v_student3 IS NOT NULL THEN
    INSERT INTO student_academic_summaries (
      tenant_id, student_user_id, cumulative_demerit_points, is_subject_back_triggered,
      subject_back_course_id, subject_back_triggered_at
    )
    VALUES (v_tenant, v_student3, 6, TRUE, v_course, NOW() - INTERVAL '7 days')
    ON CONFLICT (tenant_id, student_user_id) DO UPDATE SET
      cumulative_demerit_points = 6,
      is_subject_back_triggered = TRUE,
      subject_back_course_id = EXCLUDED.subject_back_course_id,
      subject_back_triggered_at = EXCLUDED.subject_back_triggered_at,
      updated_at = NOW();
  END IF;

  -- Pending: student1, 2 points (below threshold alone)
  IF v_student1 IS NOT NULL THEN
    INSERT INTO demerit_incidents (
      incident_id, tenant_id, student_user_id, course_id, faculty_user_id,
      category, points, description, evidence_urls, status, created_at
    )
    VALUES (
      'd2000001-0000-4000-8000-000000000001'::uuid,
      v_tenant, v_student1, v_course, v_faculty,
      'BEHAVIORAL', 2,
      'SMOKE: Disruptive behaviour during lab session — referred to DC.',
      '["https://example.com/evidence/lab-incident.pdf"]'::jsonb,
      'PENDING_DC_REVIEW',
      NOW() - INTERVAL '1 day'
    )
    ON CONFLICT (incident_id) DO UPDATE SET
      description = EXCLUDED.description,
      status = EXCLUDED.status,
      updated_at = NOW();
  END IF;

  -- Pending: student2, 2 points (will trigger subject back — already at 4)
  IF v_student2 IS NOT NULL THEN
    INSERT INTO demerit_incidents (
      incident_id, tenant_id, student_user_id, course_id, faculty_user_id,
      category, points, description, evidence_urls, status, created_at
    )
    VALUES (
      'd2000002-0000-4000-8000-000000000002'::uuid,
      v_tenant, v_student2, v_course, v_faculty,
      'PLAGIARISM', 2,
      'SMOKE: Copied assignment submission — faculty referred to DC for 2 demerit points.',
      '["https://example.com/evidence/plagiarism-report.pdf"]'::jsonb,
      'PENDING_DC_REVIEW',
      NOW() - INTERVAL '6 hours'
    )
    ON CONFLICT (incident_id) DO UPDATE SET
      description = EXCLUDED.description,
      status = EXCLUDED.status,
      updated_at = NOW();
  END IF;

  -- Approved historical case for student1
  IF v_student1 IS NOT NULL AND v_dc IS NOT NULL THEN
    INSERT INTO demerit_incidents (
      incident_id, tenant_id, student_user_id, course_id, faculty_user_id,
      category, points, description, evidence_urls, status,
      dc_reviewer_id, dc_committee_remarks, created_at, updated_at
    )
    VALUES (
      'd2000003-0000-4000-8000-000000000003'::uuid,
      v_tenant, v_student1, v_course, v_faculty,
      'ATTENDANCE', 1,
      'SMOKE: Chronic absenteeism warning — approved by DC.',
      '[]'::jsonb,
      'APPROVED_BY_DC',
      v_dc,
      'SMOKE: Warning issued; 1 demerit point recorded.',
      NOW() - INTERVAL '30 days',
      NOW() - INTERVAL '29 days'
    )
    ON CONFLICT (incident_id) DO NOTHING;

    INSERT INTO student_academic_summaries (tenant_id, student_user_id, cumulative_demerit_points, is_subject_back_triggered)
    VALUES (v_tenant, v_student1, 1, FALSE)
    ON CONFLICT (tenant_id, student_user_id) DO UPDATE SET
      cumulative_demerit_points = GREATEST(student_academic_summaries.cumulative_demerit_points, 1),
      updated_at = NOW();
  END IF;

  -- Rejected case for badge testing
  IF v_student1 IS NOT NULL AND v_dc IS NOT NULL THEN
    INSERT INTO demerit_incidents (
      incident_id, tenant_id, student_user_id, course_id, faculty_user_id,
      category, points, description, evidence_urls, status,
      dc_reviewer_id, dc_committee_remarks, created_at, updated_at
    )
    VALUES (
      'd2000004-0000-4000-8000-000000000004'::uuid,
      v_tenant, v_student1, v_course, v_faculty,
      'EXAM_MALPRACTICE', 3,
      'SMOKE: Suspected malpractice — insufficient evidence.',
      '[]'::jsonb,
      'REJECTED_BY_DC',
      v_dc,
      'SMOKE: Case dismissed — evidence inconclusive.',
      NOW() - INTERVAL '14 days',
      NOW() - INTERVAL '13 days'
    )
    ON CONFLICT (incident_id) DO NOTHING;
  END IF;

  RAISE NOTICE 'Demerit DC smoke data seeded';
END $$;

-- Smoke data for Ph.D. lifecycle module.

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'phd.lifecycle',
  'research',
  'drc@mygyanvihar.com',
  'Ph.D. Lifecycle',
  'PET application + admitted scholar in progress monitoring',
  'Full admission → registration → progress → synopsis → thesis → viva → award workflow.'
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
  v_student1 UUID;
  v_student2 UUID;
  v_faculty UUID;
  v_hod UUID;
  v_drc_role INT;
  v_rac_role INT;
  v_rrc_role INT;
  v_adj_role INT;
  -- Committee personas (password123)
  v_pwd TEXT := '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO';
BEGIN
  IF to_regclass('public.phd_candidates') IS NULL THEN
    RAISE NOTICE 'Skipping phd smoke: table not found';
    RETURN;
  END IF;

  SELECT tenant_id INTO v_tenant FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  SELECT user_id INTO v_student1 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student2 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student2@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_faculty FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'faculty2@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_hod FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'hod@mygyanvihar.com' LIMIT 1;
  SELECT role_id INTO v_drc_role FROM roles WHERE role_name = 'DRC_MEMBER' LIMIT 1;
  SELECT role_id INTO v_rac_role FROM roles WHERE role_name = 'RAC_MEMBER' LIMIT 1;
  SELECT role_id INTO v_rrc_role FROM roles WHERE role_name = 'RRC_MEMBER' LIMIT 1;
  SELECT role_id INTO v_adj_role FROM roles WHERE role_name = 'PHD_ADJUDICATOR' LIMIT 1;

  IF v_tenant IS NULL THEN RETURN; END IF;

  -- Committee personas (password123 via existing seed pattern)
  INSERT INTO users (user_id, tenant_id, role_id, name, official_email, password_hash, is_active, dept_id)
  VALUES
    ('b00000d1-0000-4000-8000-0000000000d1'::uuid, v_tenant, v_drc_role, 'DRC Member', 'drc@mygyanvihar.com',
     v_pwd, true, 1),
    ('b00000a2-0000-4000-8000-0000000000a2'::uuid, v_tenant, v_rac_role, 'RAC Member', 'rac@mygyanvihar.com',
     v_pwd, true, 1),
    ('b00000a3-0000-4000-8000-0000000000a3'::uuid, v_tenant, v_rrc_role, 'RRC Member', 'rrc@mygyanvihar.com',
     v_pwd, true, 1),
    ('b00000a4-0000-4000-8000-0000000000a4'::uuid, v_tenant, v_adj_role, 'PhD Adjudicator', 'adjudicator@mygyanvihar.com',
     v_pwd, true, 1)
  ON CONFLICT (user_id) DO UPDATE SET
    role_id = EXCLUDED.role_id,
    password_hash = EXCLUDED.password_hash,
    is_active = true;

  -- Candidate 1: student2 PET application awaiting DRC scrutiny
  IF v_student2 IS NOT NULL THEN
    INSERT INTO phd_candidates (
      candidate_id, tenant_id, user_id, applicant_name, applicant_email,
      application_type, proposed_topic, dept_id, lifecycle_stage, lifecycle_status,
      pending_actor_role, created_at
    ) VALUES (
      'a6000001-0000-4000-8000-000000000001'::uuid,
      v_tenant, v_student2, 'Student Two', 'student2@mygyanvihar.com',
      'PET', 'SMOKE: Blockchain for Supply Chain Transparency in Agriculture', 1,
      'ADMISSION', 'APPLICATION_SUBMITTED', 'DRC_MEMBER',
      NOW() - INTERVAL '3 days'
    )
    ON CONFLICT (candidate_id) DO UPDATE SET
      lifecycle_status = 'APPLICATION_SUBMITTED',
      pending_actor_role = 'DRC_MEMBER',
      updated_at = NOW();
  END IF;

  -- Candidate 2: student1 admitted scholar in progress monitoring with guide
  IF v_student1 IS NOT NULL AND v_faculty IS NOT NULL THEN
    INSERT INTO phd_candidates (
      candidate_id, tenant_id, user_id, applicant_name, applicant_email,
      application_type, proposed_topic, dept_id, guide_user_id,
      lifecycle_stage, lifecycle_status, pending_actor_role,
      fee_paid, documents_verified, admission_certificate_issued, guide_certificate_issued,
      semester_count, created_at
    ) VALUES (
      'a6000002-0000-4000-8000-000000000002'::uuid,
      v_tenant, v_student1, 'Student One', 'student1@mygyanvihar.com',
      'PET_EXEMPTION', 'SMOKE: Deep Learning for Agricultural Yield Prediction', 1, v_faculty,
      'PROGRESS', 'PROGRESS_REPORT_DUE', 'Student',
      true, true, true, true,
      2,
      NOW() - INTERVAL '180 days'
    )
    ON CONFLICT (candidate_id) DO UPDATE SET
      lifecycle_status = 'PROGRESS_REPORT_DUE',
      pending_actor_role = 'Student',
      guide_user_id = v_faculty,
      updated_at = NOW();

    INSERT INTO phd_submissions (
      submission_id, candidate_id, tenant_id, submission_type, semester, status, notes, created_at
    ) VALUES (
      'a6000003-0000-4000-8000-000000000003'::uuid,
      'a6000002-0000-4000-8000-000000000002'::uuid,
      v_tenant, 'PROGRESS_REPORT', 2, 'APPROVED',
      'SMOKE: Semester 2 progress satisfactory — literature review completed.',
      NOW() - INTERVAL '90 days'
    )
    ON CONFLICT (submission_id) DO NOTHING;
  END IF;

  RAISE NOTICE 'Ph.D. lifecycle smoke data seeded';
END $$;

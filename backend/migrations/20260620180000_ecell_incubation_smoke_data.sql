-- E-Cell & Incubation Hub smoke data for end-to-end QA (password123 personas).
-- Covers triage → L1 → L2 → funding, founder mode, mentor meetings, and finance payouts.

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
VALUES (
  'ecell.incubation-hub',
  'incubation',
  'incubation@mygyanvihar.com',
  'E-Cell pitch pipeline and founder mode',
  'CampusPay / EduTrack AI / AgriSense smoke startups',
  'Active cohort plus projects at SUBMITTED, L1, L2, FUNDED, and REJECTED stages. Founder mode on student1@.'
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
  v_config UUID := 'e0000000-0000-4000-8000-000000000001'::uuid;
  v_student1 UUID;
  v_student2 UUID;
  v_student3 UUID;
  v_student4 UUID;
  v_student5 UUID;
  v_hod UUID;
  v_president UUID;
  v_faculty UUID;
  v_workspace UUID;
  v_proj_submitted UUID := 'e0000001-0000-4000-8000-000000000001'::uuid;
  v_proj_l1 UUID := 'e0000002-0000-4000-8000-000000000002'::uuid;
  v_proj_l2 UUID := 'e0000003-0000-4000-8000-000000000003'::uuid;
  v_proj_funded UUID := 'e0000004-0000-4000-8000-000000000004'::uuid;
  v_proj_rejected UUID := 'e0000005-0000-4000-8000-000000000005'::uuid;
BEGIN
  IF to_regclass('public.ecell_configurations') IS NULL THEN
    RAISE NOTICE 'Skipping ecell smoke: ecell tables not found';
    RETURN;
  END IF;

  SELECT tenant_id INTO v_tenant FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Skipping ecell smoke: tenant sgvu not found';
    RETURN;
  END IF;

  SELECT user_id INTO v_student1 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student2 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student2@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student3 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'e2e.student3@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student4 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'e2e.student4@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student5 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'e2e.student5@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_hod FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'hod@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_president FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'president@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_faculty FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1;

  INSERT INTO ecell_configurations (
    config_id, tenant_id, cohort_name, is_active, max_funding_limit,
    level_1_approver_role, level_2_approver_role
  )
  VALUES (
    v_config, v_tenant, 'SMOKE Incubation Cohort 2026', true, 500000.00,
    'HOD', 'President'
  )
  ON CONFLICT (config_id) DO UPDATE SET
    cohort_name = EXCLUDED.cohort_name,
    is_active = EXCLUDED.is_active,
    max_funding_limit = EXCLUDED.max_funding_limit,
    level_1_approver_role = EXCLUDED.level_1_approver_role,
    level_2_approver_role = EXCLUDED.level_2_approver_role,
    updated_at = NOW();

  UPDATE ecell_configurations
  SET is_active = false, updated_at = NOW()
  WHERE tenant_id = v_tenant AND config_id <> v_config;

  UPDATE ecell_configurations
  SET is_active = true, updated_at = NOW()
  WHERE config_id = v_config;

  -- SUBMITTED: incubation admin triage inbox (student2)
  IF v_student2 IS NOT NULL THEN
    INSERT INTO ecell_projects (
      project_id, tenant_id, config_id, student_user_id, startup_name,
      innovation_description, pitch_deck_url, requested_funding, current_status, submitted_at
    )
    VALUES (
      v_proj_submitted, v_tenant, v_config, v_student2, 'CampusPay',
      'UPI-lite wallet for campus canteen, hostel, and transport — one tap, zero cash queues.',
      '/smoke/ecell/campuspay-deck.pdf', 75000.00, 'SUBMITTED', NOW() - INTERVAL '2 days'
    )
    ON CONFLICT (project_id) DO UPDATE SET
      config_id = EXCLUDED.config_id,
      startup_name = EXCLUDED.startup_name,
      innovation_description = EXCLUDED.innovation_description,
      requested_funding = EXCLUDED.requested_funding,
      current_status = EXCLUDED.current_status,
      updated_at = NOW();
  END IF;

  -- UNDER_L1_REVIEW: HOD approval queue (e2e.student3)
  IF v_student3 IS NOT NULL THEN
    INSERT INTO ecell_projects (
      project_id, tenant_id, config_id, student_user_id, startup_name,
      innovation_description, pitch_deck_url, requested_funding, current_status, submitted_at
    )
    VALUES (
      v_proj_l1, v_tenant, v_config, v_student3, 'AgriSense',
      'IoT soil-moisture sensors with vernacular alerts for smallholder farmers near Jaipur.',
      '/smoke/ecell/agrisense-deck.pdf', 120000.00, 'UNDER_L1_REVIEW', NOW() - INTERVAL '5 days'
    )
    ON CONFLICT (project_id) DO UPDATE SET
      config_id = EXCLUDED.config_id,
      startup_name = EXCLUDED.startup_name,
      innovation_description = EXCLUDED.innovation_description,
      requested_funding = EXCLUDED.requested_funding,
      current_status = EXCLUDED.current_status,
      updated_at = NOW();
  END IF;

  -- L1_APPROVED: President L2 grant queue (e2e.student4)
  IF v_student4 IS NOT NULL THEN
    INSERT INTO ecell_projects (
      project_id, tenant_id, config_id, student_user_id, startup_name,
      innovation_description, pitch_deck_url, requested_funding, approved_funding_amount,
      current_status, submitted_at
    )
    VALUES (
      v_proj_l2, v_tenant, v_config, v_student4, 'LearnLoop',
      'Adaptive revision loops for engineering students using spaced repetition and faculty rubrics.',
      '/smoke/ecell/learnloop-deck.pdf', 100000.00, 85000.00,
      'L1_APPROVED', NOW() - INTERVAL '8 days'
    )
    ON CONFLICT (project_id) DO UPDATE SET
      config_id = EXCLUDED.config_id,
      startup_name = EXCLUDED.startup_name,
      innovation_description = EXCLUDED.innovation_description,
      requested_funding = EXCLUDED.requested_funding,
      approved_funding_amount = EXCLUDED.approved_funding_amount,
      current_status = EXCLUDED.current_status,
      updated_at = NOW();

    IF v_hod IS NOT NULL THEN
      INSERT INTO ecell_approvals (
        tenant_id, project_id, approver_user_id, approval_level, status,
        approved_funding_amount, remarks, action_date
      )
      SELECT v_tenant, v_proj_l2, v_hod, 1, 'APPROVED', 85000.00,
             'Strong MVP and faculty mentor assigned.', NOW() - INTERVAL '1 day'
      WHERE NOT EXISTS (
        SELECT 1 FROM ecell_approvals
        WHERE project_id = v_proj_l2 AND approval_level = 1
      );
    END IF;
  END IF;

  -- FUNDED: founder mode + portfolio + finance payout (student1)
  IF v_student1 IS NOT NULL THEN
    INSERT INTO ecell_projects (
      project_id, tenant_id, config_id, student_user_id, startup_name,
      innovation_description, pitch_deck_url, requested_funding, approved_funding_amount,
      current_status, submitted_at
    )
    VALUES (
      v_proj_funded, v_tenant, v_config, v_student1, 'EduTrack AI',
      'AI attendance and engagement nudges for large lecture halls — privacy-first, on-prem inference.',
      '/smoke/ecell/edutrack-deck.pdf', 150000.00, 125000.00,
      'FUNDED', NOW() - INTERVAL '21 days'
    )
    ON CONFLICT (project_id) DO UPDATE SET
      config_id = EXCLUDED.config_id,
      startup_name = EXCLUDED.startup_name,
      innovation_description = EXCLUDED.innovation_description,
      requested_funding = EXCLUDED.requested_funding,
      approved_funding_amount = EXCLUDED.approved_funding_amount,
      current_status = EXCLUDED.current_status,
      updated_at = NOW();

    IF v_hod IS NOT NULL THEN
      INSERT INTO ecell_approvals (
        tenant_id, project_id, approver_user_id, approval_level, status,
        approved_funding_amount, remarks, action_date
      )
      SELECT v_tenant, v_proj_funded, v_hod, 1, 'APPROVED', 130000.00,
             'L1: viable product-market fit for campus pilots.', NOW() - INTERVAL '14 days'
      WHERE NOT EXISTS (
        SELECT 1 FROM ecell_approvals
        WHERE project_id = v_proj_funded AND approval_level = 1
      );
    END IF;

    IF v_president IS NOT NULL THEN
      INSERT INTO ecell_approvals (
        tenant_id, project_id, approver_user_id, approval_level, status,
        approved_funding_amount, remarks, action_date
      )
      SELECT v_tenant, v_proj_funded, v_president, 2, 'APPROVED', 125000.00,
             'L2: grant approved for semester-one build-out.', NOW() - INTERVAL '10 days'
      WHERE NOT EXISTS (
        SELECT 1 FROM ecell_approvals
        WHERE project_id = v_proj_funded AND approval_level = 2
      );
    END IF;

    IF to_regclass('public.ecell_disbursement_requests') IS NOT NULL THEN
      INSERT INTO ecell_disbursement_requests (
        tenant_id, project_id, student_user_id, amount, grant_tag,
        bank_account_ref, status, journal_source_id, created_at, posted_at
      )
      SELECT
        v_tenant, v_proj_funded, v_student1, 125000.00, 'E-Cell Grant',
        '{"accountLast4":"4521","ifsc":"SBIN0001234"}'::text,
        'POSTED', 'smoke-ecell-disburse-001', NOW() - INTERVAL '9 days', NOW() - INTERVAL '9 days'
      WHERE NOT EXISTS (
        SELECT 1 FROM ecell_disbursement_requests
        WHERE project_id = v_proj_funded AND status = 'POSTED'
      );
    END IF;
  END IF;

  -- REJECTED: portfolio edge case (e2e.student5)
  IF v_student5 IS NOT NULL THEN
    INSERT INTO ecell_projects (
      project_id, tenant_id, config_id, student_user_id, startup_name,
      innovation_description, requested_funding, current_status, submitted_at
    )
    VALUES (
      v_proj_rejected, v_tenant, v_config, v_student5, 'CryptoCanteen',
      'Blockchain meal tokens — rejected as out of scope for campus incubation policy.',
      500000.00, 'REJECTED', NOW() - INTERVAL '12 days'
    )
    ON CONFLICT (project_id) DO UPDATE SET
      config_id = EXCLUDED.config_id,
      startup_name = EXCLUDED.startup_name,
      innovation_description = EXCLUDED.innovation_description,
      requested_funding = EXCLUDED.requested_funding,
      current_status = EXCLUDED.current_status,
      updated_at = NOW();
  END IF;

  -- Founder mode: workspace booking + mentor meetings for EduTrack AI
  IF v_student1 IS NOT NULL AND to_regclass('public.ecell_workspaces') IS NOT NULL THEN
    SELECT workspace_id INTO v_workspace
    FROM ecell_workspaces
    WHERE tenant_id = v_tenant AND name = 'Conference Room A'
    LIMIT 1;

    IF v_workspace IS NOT NULL AND to_regclass('public.ecell_workspace_bookings') IS NOT NULL THEN
      INSERT INTO ecell_workspace_bookings (
        tenant_id, workspace_id, project_id, booked_by_user_id,
        start_time, end_time, purpose, status
      )
      SELECT
        v_tenant, v_workspace, v_proj_funded, v_student1,
        date_trunc('day', NOW() + INTERVAL '2 days') + TIME '14:00',
        date_trunc('day', NOW() + INTERVAL '2 days') + TIME '16:00',
        'Investor demo dry run', 'CONFIRMED'
      WHERE NOT EXISTS (
        SELECT 1 FROM ecell_workspace_bookings
        WHERE project_id = v_proj_funded AND purpose = 'Investor demo dry run'
      );
    END IF;
  END IF;

  IF v_student1 IS NOT NULL AND v_faculty IS NOT NULL AND to_regclass('public.ecell_mentor_meetings') IS NOT NULL THEN
    INSERT INTO ecell_mentor_meetings (
      tenant_id, project_id, requested_by_user_id, mentor_user_id,
      topic, requested_time, status
    )
    SELECT
      v_tenant, v_proj_funded, v_student1, v_faculty,
      'Go-to-market for campus SaaS pilots',
      date_trunc('day', NOW() + INTERVAL '3 days') + TIME '11:00',
      'PENDING'
    WHERE NOT EXISTS (
      SELECT 1 FROM ecell_mentor_meetings
      WHERE project_id = v_proj_funded AND topic = 'Go-to-market for campus SaaS pilots'
    );

    INSERT INTO ecell_mentor_meetings (
      tenant_id, project_id, requested_by_user_id, mentor_user_id,
      topic, requested_time, meeting_link, status, mentor_feedback
    )
    SELECT
      v_tenant, v_proj_funded, v_student1, v_faculty,
      'Pitch deck review — completed session',
      NOW() - INTERVAL '4 days',
      'https://meet.example.com/smoke-edutrack',
      'COMPLETED',
      'Sharpen unit economics slide; strong technical narrative.'
    WHERE NOT EXISTS (
      SELECT 1 FROM ecell_mentor_meetings
      WHERE project_id = v_proj_funded AND topic = 'Pitch deck review — completed session'
    );
  END IF;
END $$;

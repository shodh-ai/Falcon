-- Smoke data for Faculty → Project & Lab Guides (/faculty/projects).
-- Logins (password123): faculty1@mygyanvihar.com · students student1@ / student2@ / student3@

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'faculty.project-guides',
  'faculty',
  'faculty1@mygyanvihar.com',
  'Project & Lab Guides',
  '2 active + 1 completed B.Tech/MBA guides with students and funding trackers',
  'Login faculty1@ → /faculty/projects. HOD inbox shows pending funding on AI Microservices project.'
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
  v_faculty UUID;
  v_hod UUID;
  v_student1 UUID;
  v_student2 UUID;
  v_student3 UUID;
  v_guide1 UUID := 'f3000001-0000-4000-8000-000000000001'::uuid;
  v_guide2 UUID := 'f3000002-0000-4000-8000-000000000002'::uuid;
  v_guide3 UUID := 'f3000003-0000-4000-8000-000000000003'::uuid;
BEGIN
  IF to_regclass('public.faculty_project_guides') IS NULL THEN
    RAISE NOTICE 'Skipping project guide smoke: faculty_project_guides not found';
    RETURN;
  END IF;

  SELECT tenant_id INTO v_tenant FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  SELECT user_id INTO v_faculty FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_hod FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'hod@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student1 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student2 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student2@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student3 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student3@mygyanvihar.com' LIMIT 1;

  IF v_tenant IS NULL OR v_faculty IS NULL THEN
    RAISE NOTICE 'Skipping project guide smoke: tenant or faculty1 missing';
    RETURN;
  END IF;

  DELETE FROM project_funding_requests WHERE guide_id IN (v_guide1, v_guide2, v_guide3);
  DELETE FROM project_guide_students WHERE guide_id IN (v_guide1, v_guide2, v_guide3);
  DELETE FROM faculty_project_guides WHERE guide_id IN (v_guide1, v_guide2, v_guide3);

  -- Active project: multi-student team + prior transferred funding + new pending request
  INSERT INTO faculty_project_guides (
    guide_id, tenant_id, faculty_user_id, project_title, program, status,
    start_date, end_date, funding_allocated, funding_consumed, created_at
  ) VALUES (
    v_guide1, v_tenant, v_faculty,
    'AI-driven Microservice Architecture',
    'B.Tech CSE',
    'ACTIVE',
    CURRENT_DATE - 30,
    NULL,
    50000.00,
    15000.00,
    NOW() - INTERVAL '30 days'
  );

  -- Active project: single student + HOD-approved funding awaiting transfer
  INSERT INTO faculty_project_guides (
    guide_id, tenant_id, faculty_user_id, project_title, program, status,
    start_date, end_date, funding_allocated, funding_consumed, created_at
  ) VALUES (
    v_guide2, v_tenant, v_faculty,
    'Blockchain Supply Chain Tracker',
    'B.Tech CSE',
    'ACTIVE',
    CURRENT_DATE - 10,
    NULL,
    10000.00,
    0,
    NOW() - INTERVAL '10 days'
  );

  -- Completed project with final grades
  INSERT INTO faculty_project_guides (
    guide_id, tenant_id, faculty_user_id, project_title, program, status,
    start_date, end_date, funding_allocated, funding_consumed, created_at
  ) VALUES (
    v_guide3, v_tenant, v_faculty,
    'IoT Smart Agriculture System',
    'M.Tech',
    'COMPLETED',
    CURRENT_DATE - 180,
    CURRENT_DATE - 5,
    25000.00,
    24500.00,
    NOW() - INTERVAL '180 days'
  );

  IF to_regclass('public.project_guide_students') IS NOT NULL THEN
    IF v_student1 IS NOT NULL THEN
      INSERT INTO project_guide_students (guide_id, student_user_id, tenant_id)
      VALUES (v_guide1, v_student1, v_tenant)
      ON CONFLICT (guide_id, student_user_id) DO NOTHING;
    END IF;
    IF v_student2 IS NOT NULL THEN
      INSERT INTO project_guide_students (guide_id, student_user_id, tenant_id)
      VALUES (v_guide1, v_student2, v_tenant)
      ON CONFLICT (guide_id, student_user_id) DO NOTHING;
    END IF;
    IF v_student3 IS NOT NULL THEN
      INSERT INTO project_guide_students (guide_id, student_user_id, tenant_id)
      VALUES (v_guide2, v_student3, v_tenant)
      ON CONFLICT (guide_id, student_user_id) DO NOTHING;

      INSERT INTO project_guide_students (guide_id, student_user_id, grade, tenant_id)
      VALUES (v_guide3, v_student3, 'A', v_tenant)
      ON CONFLICT (guide_id, student_user_id) DO UPDATE SET grade = EXCLUDED.grade;
    END IF;
    IF v_student1 IS NOT NULL THEN
      INSERT INTO project_guide_students (guide_id, student_user_id, grade, tenant_id)
      VALUES (v_guide3, v_student1, 'A+', v_tenant)
      ON CONFLICT (guide_id, student_user_id) DO UPDATE SET grade = EXCLUDED.grade;
    END IF;
  END IF;

  IF to_regclass('public.project_funding_requests') IS NOT NULL THEN
    INSERT INTO project_funding_requests (
      request_id, tenant_id, guide_id, requested_by, amount, purpose, status,
      hod_user_id, hod_commit_message, created_at, updated_at
    ) VALUES
    (
      'f3000011-0000-4000-8000-000000000011'::uuid,
      v_tenant, v_guide1, v_faculty, 12000.00,
      'GPU cloud credits and Jetson Nano board for model inference',
      'PENDING_HOD',
      v_hod,
      NULL,
      NOW() - INTERVAL '2 days',
      NOW() - INTERVAL '2 days'
    ),
    (
      'f3000012-0000-4000-8000-000000000012'::uuid,
      v_tenant, v_guide1, v_faculty, 15000.00,
      'Initial hardware kit — sensors and microcontrollers',
      'TRANSFERRED',
      v_hod,
      'Approved for semester lab budget.',
      NOW() - INTERVAL '25 days',
      NOW() - INTERVAL '20 days'
    ),
    (
      'f3000013-0000-4000-8000-000000000013'::uuid,
      v_tenant, v_guide2, v_faculty, 8000.00,
      'Hyperledger Fabric hosting and domain certificates',
      'APPROVED_HOD',
      v_hod,
      'Approved — release after finance clearance.',
      NOW() - INTERVAL '4 days',
      NOW() - INTERVAL '1 day'
    ),
    (
      'f3000014-0000-4000-8000-000000000014'::uuid,
      v_tenant, v_guide2, v_faculty, 25000.00,
      'Conference travel (rejected sample)',
      'REJECTED_HOD',
      v_hod,
      'Travel not covered under project seed fund; use department seminar budget.',
      NOW() - INTERVAL '15 days',
      NOW() - INTERVAL '14 days'
    );
  END IF;

  RAISE NOTICE 'Faculty project guide smoke seeded for faculty1@ (3 projects)';
END $$;

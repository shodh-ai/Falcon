-- Smoke data for student safety concerns (ragging / sexual harassment).
-- Logins (password123): student1@ / student2@ / faculty2@ / hod@ / dc via demerit smoke persona

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'student.safety.concerns',
  'disciplinary-committee',
  'dc@mygyanvihar.com',
  'Ragging & Sexual Harassment',
  'Pending ragging vs faculty + under-review harassment vs senior',
  'Student raises concern with optional proof; faculty accused gets official notice; DC/HOD/HR/Dean/Warden routed by rules.'
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
BEGIN
  IF to_regclass('public.student_safety_concerns') IS NULL THEN
    RAISE NOTICE 'Skipping safety concern smoke: table not found';
    RETURN;
  END IF;

  SELECT tenant_id INTO v_tenant FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  SELECT user_id INTO v_student1 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student2 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student2@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_faculty FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'faculty2@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_hod FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'hod@mygyanvihar.com' LIMIT 1;

  IF v_tenant IS NULL OR v_student1 IS NULL THEN
    RAISE NOTICE 'Skipping safety concern smoke: tenant or student1 missing';
    RETURN;
  END IF;

  -- Concern 1: Ragging against faculty — SUBMITTED, proof attached, faculty notified
  IF v_faculty IS NOT NULL THEN
    INSERT INTO student_safety_concerns (
      concern_id, tenant_id, reporter_user_id, concern_type, accused_type, accused_user_id,
      incident_description, incident_location, is_hostel_related, evidence_urls, status,
      routed_to_roles, accused_notified_at, created_at
    )
    VALUES (
      'a5000001-0000-4000-8000-000000000001'::uuid,
      v_tenant, v_student1, 'RAGGING', 'FACULTY', v_faculty,
      'SMOKE: Repeated verbal intimidation during lab sessions. Students asked to stay back unfairly and humiliated.',
      'CS Lab — Block B', FALSE,
      '["https://example.com/evidence/ragging-statement.pdf"]'::jsonb,
      'SUBMITTED',
      ARRAY['DC_MEMBER', 'HOD'],
      NOW() - INTERVAL '1 day',
      NOW() - INTERVAL '2 days'
    )
    ON CONFLICT (concern_id) DO UPDATE SET
      status = 'SUBMITTED', accused_notified_at = NOW() - INTERVAL '1 day', updated_at = NOW();
  END IF;

  -- Concern 2: Sexual harassment against senior student — UNDER_REVIEW, hostel-related
  IF v_student2 IS NOT NULL THEN
    INSERT INTO student_safety_concerns (
      concern_id, tenant_id, reporter_user_id, concern_type, accused_type,
      accused_description, incident_description, incident_location, is_hostel_related,
      evidence_urls, status, routed_to_roles, reviewer_user_id, reviewer_remarks, created_at
    )
    VALUES (
      'a5000002-0000-4000-8000-000000000002'::uuid,
      v_tenant, v_student1, 'SEXUAL_HARASSMENT', 'SENIOR',
      'SMOKE: 4th year senior in Manikarnika block — name withheld by reporter',
      'SMOKE: Inappropriate comments and stalking near hostel mess. Incident repeated over two weeks.',
      'Manikarnika Hostel — Mess area', TRUE,
      '[]'::jsonb,
      'UNDER_REVIEW',
      ARRAY['DC_MEMBER', 'HR', 'Dean', 'HOD', 'Warden'],
      v_hod,
      'SMOKE: Initial contact made with hostel warden. ICC review scheduled.',
      NOW() - INTERVAL '4 days'
    )
    ON CONFLICT (concern_id) DO UPDATE SET
      status = 'UNDER_REVIEW', updated_at = NOW();
  END IF;

  RAISE NOTICE 'Student safety concern smoke data seeded';
END $$;

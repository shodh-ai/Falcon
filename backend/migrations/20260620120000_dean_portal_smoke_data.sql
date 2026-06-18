-- Dean portal smoke data: school assignment, program linkage, and QA manifest entry.

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES
  (
    'dean.portal',
    'dean',
    'dev.dean@mygyanvihar.com',
    'School command center and department oversight',
    'School of Engineering & Technology',
    'Assigns dev.dean@mygyanvihar.com to a school and links programs to departments for Dean scope resolution.'
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
  v_dean UUID;
  v_campus INT;
  v_school INT;
  v_dept INT;
BEGIN
  IF to_regclass('public.schools') IS NULL OR to_regclass('public.iam_programs') IS NULL THEN
    RAISE NOTICE 'Skipping dean portal smoke data: schools or iam_programs missing';
    RETURN;
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Skipping dean portal smoke data: tenant sgvu not found';
    RETURN;
  END IF;

  SELECT user_id INTO v_dean
  FROM users
  WHERE tenant_id = v_tenant AND lower(official_email) = 'dev.dean@mygyanvihar.com'
  LIMIT 1;

  SELECT dept_id INTO v_dept FROM departments WHERE dept_name = 'Computer Science' LIMIT 1;

  IF to_regclass('public.campuses') IS NOT NULL THEN
    INSERT INTO campuses (campus_name, campus_code)
    SELECT 'Main Campus', 'MAIN'
    WHERE NOT EXISTS (SELECT 1 FROM campuses LIMIT 1);
    SELECT campus_id INTO v_campus FROM campuses ORDER BY campus_id ASC LIMIT 1;
  END IF;

  INSERT INTO schools (school_name, school_code, campus_id, dean_user_id)
  SELECT 'School of Engineering & Technology', 'SOET', v_campus, v_dean
  WHERE NOT EXISTS (
    SELECT 1 FROM schools WHERE school_name = 'School of Engineering & Technology'
  );

  SELECT school_id INTO v_school
  FROM schools
  WHERE school_name = 'School of Engineering & Technology'
  LIMIT 1;

  IF v_school IS NOT NULL AND v_dean IS NOT NULL THEN
    UPDATE schools SET dean_user_id = v_dean WHERE school_id = v_school AND dean_user_id IS NULL;
  END IF;

  IF v_school IS NOT NULL AND v_dept IS NOT NULL THEN
    UPDATE iam_programs
    SET school_id = v_school, dept_id = COALESCE(dept_id, v_dept)
    WHERE school_id IS NULL OR dept_id IS NULL;
  END IF;
END $$;

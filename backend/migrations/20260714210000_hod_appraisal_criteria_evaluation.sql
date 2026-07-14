-- HOD multi-criteria faculty evaluation (research, academics, extension, administration).

ALTER TABLE hr_employee_appraisals
  ADD COLUMN IF NOT EXISTS hod_evaluation_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE hr_employee_appraisals
  ADD COLUMN IF NOT EXISTS hod_evaluation_notes TEXT;

DO $$
DECLARE
  v_tenant UUID;
  v_dept INT;
  v_year INT := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  fac RECORD;
BEGIN
  SELECT tenant_id INTO v_tenant FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF v_tenant IS NULL THEN RETURN; END IF;

  SELECT dept_id INTO v_dept FROM departments WHERE dept_name = 'Applied Sciences' LIMIT 1;
  IF v_dept IS NULL THEN RETURN; END IF;

  FOR fac IN
    SELECT u.user_id, u.name, u.official_email
    FROM users u
    JOIN roles r ON r.role_id = u.role_id
    WHERE u.dept_id = v_dept AND r.role_name = 'Faculty'
    ORDER BY u.name
  LOOP
    INSERT INTO hr_employee_appraisals (
      tenant_id, user_id, appraisal_year, auto_api_score, api_breakdown,
      hod_rating, hod_evaluation_breakdown, hr_final_status, calculated_at
    )
    VALUES (
      v_tenant,
      fac.user_id,
      v_year,
      CASE fac.official_email
        WHEN 'reena.saxena@mygyanvihar.com' THEN 42.00
        WHEN 'harshita.laddha@mygyanvihar.com' THEN 28.00
        ELSE 35.00
      END,
      jsonb_build_object(
        'JOURNAL', CASE fac.official_email WHEN 'reena.saxena@mygyanvihar.com' THEN 24 ELSE 15 END,
        'CONFERENCE', CASE fac.official_email WHEN 'harshita.laddha@mygyanvihar.com' THEN 10 ELSE 8 END,
        'BOOK_CHAPTER', 5
      ),
      NULL,
      '{}'::jsonb,
      'HOD_REVIEW',
      NOW()
    )
    ON CONFLICT (tenant_id, user_id, appraisal_year) DO UPDATE SET
      auto_api_score = EXCLUDED.auto_api_score,
      api_breakdown = EXCLUDED.api_breakdown,
      hr_final_status = CASE
        WHEN hr_employee_appraisals.hod_rating IS NULL THEN 'HOD_REVIEW'
        ELSE hr_employee_appraisals.hr_final_status
      END,
      calculated_at = COALESCE(hr_employee_appraisals.calculated_at, NOW());

    IF to_regclass('public.faculty_research_logs') IS NOT NULL THEN
      INSERT INTO faculty_research_logs (
        tenant_id, faculty_user_id, publication_title, publication_type, indexing_type, published_date
      )
      SELECT v_tenant, fac.user_id,
             'Applied Sciences research output — demo',
             'JOURNAL', 'SCOPUS', CURRENT_DATE - 60
      WHERE fac.official_email = 'reena.saxena@mygyanvihar.com'
        AND NOT EXISTS (
          SELECT 1 FROM faculty_research_logs fr
          WHERE fr.faculty_user_id = fac.user_id AND fr.publication_title ILIKE '%Applied Sciences research%'
        );
    END IF;
  END LOOP;

  RAISE NOTICE 'Seeded Applied Sciences faculty appraisals for %', v_year;
END $$;

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'hod.applied-sciences-appraisal-criteria',
  'hod',
  'gaurav.sharma@mygyanvihar.com',
  'faculty_appraisals',
  'Research + academics + extension + admin criteria for dept faculty',
  'HOD assigns multi-criteria scores on Appraisals page'
)
ON CONFLICT (smoke_key) DO UPDATE SET
  sample_record = EXCLUDED.sample_record,
  notes = EXCLUDED.notes,
  seeded_at = NOW();

-- Seed semester-wise SGPA/CGPA history for real-university demo students
-- so Faculty → Student Analytics can show GPA trends.

DO $$
DECLARE
  v_tenant UUID;
  rec RECORD;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'student_analytics_gpa_history_seed: sgvu tenant missing, skipping';
    RETURN;
  END IF;

  FOR rec IN
    SELECT u.user_id, lower(u.official_email) AS email
    FROM users u
    WHERE u.tenant_id = v_tenant
      AND lower(u.official_email) IN (
        'aniketsain45@gmail.com',
        'munmun.2549711@mygyanvihar.com',
        'prasoon.2548543@mygyanvihar.com',
        'sakshi.2548515@mygyanvihar.com'
      )
  LOOP
    IF to_regclass('public.grade_cards') IS NOT NULL THEN
      INSERT INTO grade_cards (tenant_id, student_user_id, semester, cgpa, status, published_at, payload)
      SELECT v_tenant, rec.user_id, s.semester, s.cgpa, 'PUBLISHED', NOW(),
             jsonb_build_object(
               'result_stage', 'FINAL',
               'academic_year', s.academic_year,
               'semester', s.semester,
               'sgpa', s.sgpa,
               'cgpa', s.cgpa
             )
      FROM (VALUES
        (1, 7.60::numeric, 7.60::numeric, '2024-25'),
        (2, 8.10::numeric, 7.85::numeric, '2024-25'),
        (3, 7.40::numeric, 7.70::numeric, '2025-26')
      ) AS s(semester, sgpa, cgpa, academic_year)
      WHERE NOT EXISTS (
        SELECT 1 FROM grade_cards g
        WHERE g.tenant_id = v_tenant
          AND g.student_user_id = rec.user_id
          AND g.semester = s.semester
      );
    END IF;

    IF to_regclass('public.academic_records') IS NOT NULL THEN
      INSERT INTO academic_records (
        tenant_id, student_user_id, academic_year, semester,
        internal_marks, mid_term_marks, end_semester_marks,
        credits_registered, credits_earned,
        sgpa, cgpa, backlog_count, progression_status, remarks
      )
      SELECT
        v_tenant, rec.user_id, s.academic_year, s.semester,
        0, 0, 0, 22, 22,
        s.sgpa, s.cgpa, 0, 'PROMOTED', 'Demo GPA history for faculty analytics'
      FROM (VALUES
        (1, 7.60::numeric, 7.60::numeric, '2024-25'),
        (2, 8.10::numeric, 7.85::numeric, '2024-25'),
        (3, 7.40::numeric, 7.70::numeric, '2025-26')
      ) AS s(semester, sgpa, cgpa, academic_year)
      WHERE NOT EXISTS (
        SELECT 1 FROM academic_records ar
        WHERE ar.tenant_id = v_tenant
          AND ar.student_user_id = rec.user_id
          AND ar.semester = s.semester
      );
    END IF;
  END LOOP;

  RAISE NOTICE 'student_analytics_gpa_history_seed: GPA history seeded for demo students';
END $$;

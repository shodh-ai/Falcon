-- Smoke data for Result Control Centre (SGVU tenant / SMOKE101 course).
-- Idempotent: safe to re-run after representative portal smoke seed.

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'exam-cell.result-control',
  'exam-cell',
  'examcell@mygyanvihar.com',
  'Result Control Centre',
  'SMOKE101 CAT2 open / QUIZ locked / END_TERM declared',
  'Grading policy, result sessions, PENDING_COE marks, and a declared student exam report for QA.'
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
  v_student UUID;
  v_student2 UUID;
  v_faculty UUID;
  v_examcell UUID;
  v_course UUID;
  v_policy INT;
  v_open_session UUID;
  v_locked_session UUID;
  v_declared_session UUID;
BEGIN
  IF to_regclass('public.exam_result_sessions') IS NULL THEN
    RAISE NOTICE 'Skipping result control smoke: exam_result_sessions not found';
    RETURN;
  END IF;

  SELECT tenant_id INTO v_tenant FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Skipping result control smoke: tenant sgvu not found';
    RETURN;
  END IF;

  SELECT user_id INTO v_student FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student2 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student2@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_faculty FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_examcell FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'examcell@mygyanvihar.com' LIMIT 1;
  SELECT course_id INTO v_course FROM academic_courses WHERE tenant_id = v_tenant AND course_code = 'SMOKE101' LIMIT 1;

  IF v_course IS NULL OR v_student IS NULL OR v_faculty IS NULL THEN
    RAISE NOTICE 'Skipping result control smoke: SMOKE101 course or core users missing';
    RETURN;
  END IF;

  IF v_student2 IS NOT NULL AND to_regclass('public.student_course_enrollments') IS NOT NULL THEN
    INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, status, attendance_percent)
    SELECT v_tenant, v_student2, v_course, 4, 'ENROLLED', 88.00
    WHERE NOT EXISTS (
      SELECT 1 FROM student_course_enrollments
      WHERE tenant_id = v_tenant AND student_user_id = v_student2 AND course_id = v_course
    );
  END IF;

  IF to_regclass('public.academic_grading_policies') IS NOT NULL THEN
    INSERT INTO academic_grading_policies (policy_name, effective_from, rules)
    SELECT
      'SMOKE Default UG Grading',
      CURRENT_DATE,
      '{
        "bands": [
          {"minPercent": 90, "maxPercent": 100, "grade": "A+", "gradePoints": 10},
          {"minPercent": 80, "maxPercent": 89.99, "grade": "A", "gradePoints": 9},
          {"minPercent": 70, "maxPercent": 79.99, "grade": "B+", "gradePoints": 8},
          {"minPercent": 60, "maxPercent": 69.99, "grade": "B", "gradePoints": 7},
          {"minPercent": 50, "maxPercent": 59.99, "grade": "C", "gradePoints": 6},
          {"minPercent": 40, "maxPercent": 49.99, "grade": "D", "gradePoints": 5},
          {"minPercent": 0, "maxPercent": 39.99, "grade": "F", "gradePoints": 0}
        ]
      }'::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM academic_grading_policies WHERE policy_name = 'SMOKE Default UG Grading'
    );

    SELECT policy_id INTO v_policy
    FROM academic_grading_policies
    WHERE policy_name = 'SMOKE Default UG Grading'
    LIMIT 1;
  END IF;

  -- OPEN session: faculty can enter CAT2 marks on SMOKE101.
  INSERT INTO exam_result_sessions (
    tenant_id, course_id, exam_type, semester, max_marks, pass_marks, grading_policy_id,
    entry_status, entry_open_at, entry_close_at
  )
  SELECT
    v_tenant, v_course, 'CAT2', 4, 50, 20, v_policy,
    'OPEN', NOW() - INTERVAL '1 day', NOW() + INTERVAL '7 days'
  WHERE NOT EXISTS (
    SELECT 1 FROM exam_result_sessions
    WHERE tenant_id = v_tenant AND course_id = v_course AND exam_type = 'CAT2' AND semester = 4
  );

  SELECT session_id INTO v_open_session
  FROM exam_result_sessions
  WHERE tenant_id = v_tenant AND course_id = v_course AND exam_type = 'CAT2' AND semester = 4
  LIMIT 1;

  -- LOCKED + processed session: COE can preview/declare QUIZ results.
  INSERT INTO exam_result_sessions (
    tenant_id, course_id, exam_type, semester, max_marks, pass_marks, grading_policy_id,
    entry_status, marks_locked, marks_locked_at, marks_locked_by,
    processed_at, processed_by
  )
  SELECT
    v_tenant, v_course, 'QUIZ', 4, 50, 20, v_policy,
    'LOCKED', TRUE, NOW() - INTERVAL '2 hours', COALESCE(v_examcell, v_faculty),
    NOW() - INTERVAL '1 hour', COALESCE(v_examcell, v_faculty)
  WHERE NOT EXISTS (
    SELECT 1 FROM exam_result_sessions
    WHERE tenant_id = v_tenant AND course_id = v_course AND exam_type = 'QUIZ' AND semester = 4
  );

  SELECT session_id INTO v_locked_session
  FROM exam_result_sessions
  WHERE tenant_id = v_tenant AND course_id = v_course AND exam_type = 'QUIZ' AND semester = 4
  LIMIT 1;

  -- DECLARED session: student/parent portals show exam report.
  INSERT INTO exam_result_sessions (
    tenant_id, course_id, exam_type, semester, max_marks, pass_marks, grading_policy_id,
    entry_status, marks_locked, marks_locked_at, marks_locked_by,
    processed_at, processed_by, declared_at, declared_by, declaration_note
  )
  SELECT
    v_tenant, v_course, 'END_TERM', 4, 100, 40, v_policy,
    'LOCKED', TRUE, NOW() - INTERVAL '3 days', COALESCE(v_examcell, v_faculty),
    NOW() - INTERVAL '2 days', COALESCE(v_examcell, v_faculty),
    NOW() - INTERVAL '1 day', COALESCE(v_examcell, v_faculty),
    'SMOKE: End-term results declared for QA walkthrough.'
  WHERE NOT EXISTS (
    SELECT 1 FROM exam_result_sessions
    WHERE tenant_id = v_tenant AND course_id = v_course AND exam_type = 'END_TERM' AND semester = 4
  );

  SELECT session_id INTO v_declared_session
  FROM exam_result_sessions
  WHERE tenant_id = v_tenant AND course_id = v_course AND exam_type = 'END_TERM' AND semester = 4
  LIMIT 1;

  IF to_regclass('public.academic_marks') IS NOT NULL THEN
    -- QUIZ marks awaiting COE declaration.
    INSERT INTO academic_marks (
      tenant_id, student_user_id, course_id, exam_type, marks_obtained, max_marks, status, uploaded_by
    )
    SELECT v_tenant, v_student, v_course, 'QUIZ', 38, 50, 'PENDING_COE', v_faculty
    WHERE NOT EXISTS (
      SELECT 1 FROM academic_marks
      WHERE tenant_id = v_tenant AND student_user_id = v_student AND course_id = v_course AND exam_type = 'QUIZ'
    );

    IF v_student2 IS NOT NULL THEN
      INSERT INTO academic_marks (
        tenant_id, student_user_id, course_id, exam_type, marks_obtained, max_marks, status, uploaded_by
      )
      SELECT v_tenant, v_student2, v_course, 'QUIZ', 22, 50, 'PENDING_COE', v_faculty
      WHERE NOT EXISTS (
        SELECT 1 FROM academic_marks
        WHERE tenant_id = v_tenant AND student_user_id = v_student2 AND course_id = v_course AND exam_type = 'QUIZ'
      );
    END IF;

    -- END_TERM published mark backing the declared report.
    INSERT INTO academic_marks (
      tenant_id, student_user_id, course_id, exam_type, marks_obtained, max_marks, status, uploaded_by, published_at
    )
    SELECT v_tenant, v_student, v_course, 'END_TERM', 72, 100, 'PUBLISHED', v_faculty, NOW() - INTERVAL '1 day'
    WHERE NOT EXISTS (
      SELECT 1 FROM academic_marks
      WHERE tenant_id = v_tenant AND student_user_id = v_student AND course_id = v_course AND exam_type = 'END_TERM'
    );
  END IF;

  IF v_declared_session IS NOT NULL AND to_regclass('public.student_exam_reports') IS NOT NULL THEN
    INSERT INTO student_exam_reports (
      tenant_id, session_id, student_user_id, course_id, exam_type,
      marks_obtained, max_marks, percent, grade, grade_points, result_status,
      report_summary, declared_at, notified_at
    )
    SELECT
      v_tenant, v_declared_session, v_student, v_course, 'END_TERM',
      72, 100, 72.00, 'B+', 8.00, 'PASS',
      'Smoke Data Engineering Lab END_TERM: 72/100 (72%) — Grade B+',
      NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'
    WHERE NOT EXISTS (
      SELECT 1 FROM student_exam_reports
      WHERE session_id = v_declared_session AND student_user_id = v_student
    );
  END IF;
END $$;

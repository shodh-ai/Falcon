-- Smoke data for UFM Malpractice Desk (SGVU tenant).
-- Idempotent: safe to re-run after representative portal / result-control seeds.

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'exam-cell.ufm-cases',
  'exam-cell',
  'examcell@mygyanvihar.com',
  'UFM Malpractice Desk',
  'OPEN / UNDER_REVIEW / CLOSED cases on student1–3',
  'Marks zeroed, grade cards withheld, transcript block QA. Login examcell@mygyanvihar.com → /exam-cell/ufm-cases.'
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
  v_student3 UUID;
  v_examcell UUID;
  v_course UUID;
  v_da_course UUID;
  v_exam_end UUID;
  v_exam_mid UUID;
BEGIN
  IF to_regclass('public.ufm_cases') IS NULL THEN
    RAISE NOTICE 'Skipping UFM smoke: ufm_cases not found';
    RETURN;
  END IF;

  SELECT tenant_id INTO v_tenant FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Skipping UFM smoke: tenant sgvu not found';
    RETURN;
  END IF;

  SELECT user_id INTO v_student FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student2 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student2@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student3 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student3@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_examcell FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'examcell@mygyanvihar.com' LIMIT 1;
  SELECT course_id INTO v_course FROM academic_courses WHERE tenant_id = v_tenant AND course_code = 'SMOKE101' LIMIT 1;
  SELECT course_id INTO v_da_course FROM academic_courses WHERE tenant_id = v_tenant AND course_code = 'DA101' LIMIT 1;

  IF v_student IS NULL OR v_examcell IS NULL THEN
    RAISE NOTICE 'Skipping UFM smoke: student1 or examcell user missing';
    RETURN;
  END IF;

  SELECT exam_schedule_id INTO v_exam_end
  FROM exam_schedules
  WHERE tenant_id = v_tenant AND exam_type = 'END_TERM'
  ORDER BY exam_date DESC
  LIMIT 1;

  IF v_exam_end IS NULL THEN
    SELECT exam_schedule_id INTO v_exam_end FROM exam_schedules WHERE tenant_id = v_tenant ORDER BY exam_date DESC LIMIT 1;
  END IF;

  SELECT exam_schedule_id INTO v_exam_mid
  FROM exam_schedules
  WHERE tenant_id = v_tenant AND exam_type = 'MID_TERM'
  ORDER BY exam_date DESC
  LIMIT 1;

  IF v_exam_mid IS NULL THEN
    v_exam_mid := v_exam_end;
  END IF;

  -- Remove legacy gap-modules seed without smoke IDs so we do not duplicate student1 rows.
  DELETE FROM ufm_cases
  WHERE tenant_id = v_tenant
    AND student_user_id = v_student
    AND case_id NOT IN (
      'a0000001-0000-4000-8000-000000000001'::uuid,
      'a0000004-0000-4000-8000-000000000004'::uuid
    );

  -- Case 1: student1 OPEN — END_TERM malpractice (marks locked, blocks transcripts).
  INSERT INTO ufm_cases (
    case_id, tenant_id, student_user_id, exam_id, description, penalty_applied,
    reported_by, marks_locked, status, logged_at
  )
  VALUES (
    'a0000001-0000-4000-8000-000000000001'::uuid,
    v_tenant,
    v_student,
    v_exam_end,
    'SMOKE: Unauthorized material (mobile phone) found during SMOKE101 end-term exam.',
    'End-term paper cancelled — pending malpractice committee',
    v_examcell,
    TRUE,
    'OPEN',
    NOW() - INTERVAL '2 days'
  )
  ON CONFLICT (case_id) DO UPDATE SET
    student_user_id = EXCLUDED.student_user_id,
    exam_id = EXCLUDED.exam_id,
    description = EXCLUDED.description,
    penalty_applied = EXCLUDED.penalty_applied,
    reported_by = EXCLUDED.reported_by,
    marks_locked = EXCLUDED.marks_locked,
    status = EXCLUDED.status,
    logged_at = EXCLUDED.logged_at;

  -- Case 4: student1 CLOSED — resolved prior incident (should not count as open).
  INSERT INTO ufm_cases (
    case_id, tenant_id, student_user_id, exam_id, description, penalty_applied,
    reported_by, marks_locked, status, logged_at
  )
  VALUES (
    'a0000004-0000-4000-8000-000000000004'::uuid,
    v_tenant,
    v_student,
    v_exam_mid,
    'SMOKE: Prior semester warning — late arrival with unapproved notes (resolved).',
    'Written warning issued — case closed',
    v_examcell,
    FALSE,
    'CLOSED',
    NOW() - INTERVAL '120 days'
  )
  ON CONFLICT (case_id) DO UPDATE SET
    description = EXCLUDED.description,
    penalty_applied = EXCLUDED.penalty_applied,
    reported_by = EXCLUDED.reported_by,
    marks_locked = EXCLUDED.marks_locked,
    status = EXCLUDED.status,
    logged_at = EXCLUDED.logged_at;

  IF v_course IS NOT NULL AND to_regclass('public.academic_marks') IS NOT NULL THEN
    -- Ensure END_TERM mark exists for student1, then zero as UFM would.
    INSERT INTO academic_marks (
      tenant_id, student_user_id, course_id, exam_type, marks_obtained, max_marks, status, published_at
    )
    SELECT v_tenant, v_student, v_course, 'END_TERM', 72, 100, 'PUBLISHED', NOW() - INTERVAL '1 day'
    WHERE NOT EXISTS (
      SELECT 1 FROM academic_marks
      WHERE tenant_id = v_tenant AND student_user_id = v_student AND course_id = v_course AND exam_type = 'END_TERM'
    );

    UPDATE academic_marks
    SET marks_obtained = 0, status = 'PUBLISHED', published_at = NOW(), updated_at = NOW()
    WHERE tenant_id = v_tenant AND student_user_id = v_student AND course_id = v_course AND exam_type = 'END_TERM';
  END IF;

  IF v_student2 IS NOT NULL AND v_course IS NOT NULL THEN
    IF to_regclass('public.student_course_enrollments') IS NOT NULL THEN
      INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, status, attendance_percent)
      SELECT v_tenant, v_student2, v_course, 4, 'ENROLLED', 86.00
      WHERE NOT EXISTS (
        SELECT 1 FROM student_course_enrollments
        WHERE tenant_id = v_tenant AND student_user_id = v_student2 AND course_id = v_course
      );
    END IF;

    IF to_regclass('public.academic_marks') IS NOT NULL THEN
      INSERT INTO academic_marks (
        tenant_id, student_user_id, course_id, exam_type, marks_obtained, max_marks, status
      )
      SELECT v_tenant, v_student2, v_course, 'QUIZ', 22, 50, 'PENDING_COE'
      WHERE NOT EXISTS (
        SELECT 1 FROM academic_marks
        WHERE tenant_id = v_tenant AND student_user_id = v_student2 AND course_id = v_course AND exam_type = 'QUIZ'
      );

      UPDATE academic_marks
      SET marks_obtained = 0, status = 'PUBLISHED', published_at = NOW(), updated_at = NOW()
      WHERE tenant_id = v_tenant AND student_user_id = v_student2 AND course_id = v_course AND exam_type = 'QUIZ';
    END IF;

    -- Case 2: student2 OPEN — QUIZ cheating on SMOKE101.
    INSERT INTO ufm_cases (
      case_id, tenant_id, student_user_id, exam_id, description, penalty_applied,
      reported_by, marks_locked, status, logged_at
    )
    VALUES (
      'a0000002-0000-4000-8000-000000000002'::uuid,
      v_tenant,
      v_student2,
      v_exam_mid,
      'SMOKE: Invigilator observed concealed chits during SMOKE101 quiz.',
      'Quiz marks cancelled — exam cancelled',
      v_examcell,
      TRUE,
      'OPEN',
      NOW() - INTERVAL '6 hours'
    )
    ON CONFLICT (case_id) DO UPDATE SET
      student_user_id = EXCLUDED.student_user_id,
      exam_id = EXCLUDED.exam_id,
      description = EXCLUDED.description,
      penalty_applied = EXCLUDED.penalty_applied,
      reported_by = EXCLUDED.reported_by,
      marks_locked = EXCLUDED.marks_locked,
      status = EXCLUDED.status,
      logged_at = EXCLUDED.logged_at;
  END IF;

  IF v_student3 IS NOT NULL AND v_course IS NOT NULL THEN
    IF to_regclass('public.student_course_enrollments') IS NOT NULL THEN
      INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, status, attendance_percent)
      SELECT v_tenant, v_student3, v_course, 4, 'ENROLLED', 91.00
      WHERE NOT EXISTS (
        SELECT 1 FROM student_course_enrollments
        WHERE tenant_id = v_tenant AND student_user_id = v_student3 AND course_id = v_course
      );
    END IF;

    IF to_regclass('public.academic_marks') IS NOT NULL THEN
      INSERT INTO academic_marks (
        tenant_id, student_user_id, course_id, exam_type, marks_obtained, max_marks, status, published_at
      )
      SELECT v_tenant, v_student3, v_course, 'INTERNAL', 16, 20, 'PUBLISHED', NOW() - INTERVAL '3 days'
      WHERE NOT EXISTS (
        SELECT 1 FROM academic_marks
        WHERE tenant_id = v_tenant AND student_user_id = v_student3 AND course_id = v_course AND exam_type = 'INTERNAL'
      );

      UPDATE academic_marks
      SET marks_obtained = 0, status = 'PUBLISHED', published_at = NOW(), updated_at = NOW()
      WHERE tenant_id = v_tenant AND student_user_id = v_student3 AND course_id = v_course AND exam_type = 'INTERNAL';
    END IF;

    -- Case 3: student3 UNDER_REVIEW — committee hearing scheduled.
    INSERT INTO ufm_cases (
      case_id, tenant_id, student_user_id, exam_id, description, penalty_applied,
      reported_by, marks_locked, status, logged_at
    )
    VALUES (
      'a0000003-0000-4000-8000-000000000003'::uuid,
      v_tenant,
      v_student3,
      v_exam_end,
      'SMOKE: Suspected answer-booklet tampering — referred to malpractice committee.',
      'Results withheld pending committee decision',
      v_examcell,
      TRUE,
      'UNDER_REVIEW',
      NOW() - INTERVAL '1 day'
    )
    ON CONFLICT (case_id) DO UPDATE SET
      student_user_id = EXCLUDED.student_user_id,
      exam_id = EXCLUDED.exam_id,
      description = EXCLUDED.description,
      penalty_applied = EXCLUDED.penalty_applied,
      reported_by = EXCLUDED.reported_by,
      marks_locked = EXCLUDED.marks_locked,
      status = EXCLUDED.status,
      logged_at = EXCLUDED.logged_at;
  END IF;

  -- Optional DA101 CAT1 marks for student2 (course-scoped UFM logging demo).
  IF v_da_course IS NOT NULL AND v_student2 IS NOT NULL AND to_regclass('public.academic_marks') IS NOT NULL THEN
    INSERT INTO academic_marks (
      tenant_id, student_user_id, course_id, exam_type, marks_obtained, max_marks, status
    )
    SELECT v_tenant, v_student2, v_da_course, 'CAT1', 36, 50, 'PUBLISHED'
    WHERE NOT EXISTS (
      SELECT 1 FROM academic_marks
      WHERE tenant_id = v_tenant AND student_user_id = v_student2 AND course_id = v_da_course AND exam_type = 'CAT1'
    );
  END IF;

  IF to_regclass('public.grade_cards') IS NOT NULL THEN
    -- Withhold grade cards for students with open UFM (mirrors createUfmCase side effect).
    UPDATE grade_cards
    SET status = 'WITHHELD',
        payload = COALESCE(payload, '{}'::jsonb) || '{"withheld_reason":"Open UFM case","result_stage":"WITHHELD"}'::jsonb
    WHERE tenant_id = v_tenant
      AND semester = 4
      AND student_user_id IN (
        SELECT student_user_id FROM ufm_cases
        WHERE tenant_id = v_tenant AND status <> 'CLOSED'
      );

    -- Seed draft grade cards where missing so withhold transition is visible.
    INSERT INTO grade_cards (tenant_id, student_user_id, semester, cgpa, status, payload)
    SELECT
      v_tenant,
      u.user_id,
      4,
      7.20,
      CASE WHEN EXISTS (
        SELECT 1 FROM ufm_cases c
        WHERE c.tenant_id = v_tenant AND c.student_user_id = u.user_id AND c.status <> 'CLOSED'
      ) THEN 'WITHHELD' ELSE 'DRAFT' END,
      jsonb_build_object(
        'result_stage', CASE WHEN EXISTS (
          SELECT 1 FROM ufm_cases c
          WHERE c.tenant_id = v_tenant AND c.student_user_id = u.user_id AND c.status <> 'CLOSED'
        ) THEN 'WITHHELD' ELSE 'DRAFT' END,
        'semester', 4,
        'sgpa', 7.20,
        'cgpa', 7.20,
        'withheld_reason', CASE WHEN EXISTS (
          SELECT 1 FROM ufm_cases c
          WHERE c.tenant_id = v_tenant AND c.student_user_id = u.user_id AND c.status <> 'CLOSED'
        ) THEN 'Open UFM case' ELSE NULL END,
        'courses', '[]'::jsonb
      )
    FROM users u
    WHERE u.tenant_id = v_tenant
      AND lower(u.official_email) IN (
        'student1@mygyanvihar.com',
        'student2@mygyanvihar.com',
        'student3@mygyanvihar.com'
      )
      AND NOT EXISTS (
        SELECT 1 FROM grade_cards g
        WHERE g.tenant_id = v_tenant AND g.student_user_id = u.user_id AND g.semester = 4
      );
  END IF;

  RAISE NOTICE 'UFM smoke data seeded for exam-cell.ufm-cases';
END $$;

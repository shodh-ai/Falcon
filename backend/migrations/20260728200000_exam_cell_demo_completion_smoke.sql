-- Completes Exam Cell demo data: re-evaluations, full grade aggregates, seating plans, transcripts, invigilation queue.

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'exam-cell.demo-completion',
  'exam-cell',
  'examcell@mygyanvihar.com',
  'Full portal demo coverage',
  'Re-evals · grade aggregates · seating plans · ABC IDs',
  'Fills gaps for re-evaluations, course grades, grade cards, transcripts, and pending invigilation requests.'
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
  v_student3 UUID;
  v_student4 UUID;
  v_faculty1 UUID;
  v_faculty2 UUID;
  v_examcell UUID;
  v_course UUID;
  v_subject INT;
  v_exam_mid UUID;
  v_assignment_pending UUID := 'd0000002-0000-4000-8000-000000000002'::uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF v_tenant IS NULL THEN RETURN; END IF;

  SELECT user_id INTO v_student1 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student2 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student2@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student3 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student3@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student4 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student4@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_faculty1 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_faculty2 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'faculty2@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_examcell FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'examcell@mygyanvihar.com' LIMIT 1;
  SELECT course_id INTO v_course FROM academic_courses WHERE tenant_id = v_tenant AND course_code = 'SMOKE101' LIMIT 1;

  IF v_course IS NULL THEN
    RAISE NOTICE 'Skipping exam-cell demo completion: SMOKE101 missing';
    RETURN;
  END IF;

  -- Link SMOKE101 course to an academic subject for re-eval applications.
  SELECT subject_id INTO v_subject FROM academic_subjects WHERE subject_code = 'SMOKE101' LIMIT 1;
  IF v_subject IS NULL THEN
    INSERT INTO academic_subjects (subject_code, subject_name, program_id, semester, credits, subject_type)
    SELECT 'SMOKE101', 'Smoke Data Engineering Lab', p.program_id, 4, 4, 'THEORY'
    FROM iam_programs p
    WHERE NOT EXISTS (SELECT 1 FROM academic_subjects WHERE subject_code = 'SMOKE101')
    ORDER BY p.program_id
    LIMIT 1;
    SELECT subject_id INTO v_subject FROM academic_subjects WHERE subject_code = 'SMOKE101' LIMIT 1;
  END IF;
  IF v_subject IS NULL THEN
    SELECT subject_id INTO v_subject FROM academic_subjects ORDER BY subject_id LIMIT 1;
  END IF;

  SELECT exam_schedule_id INTO v_exam_mid
  FROM exam_schedules
  WHERE tenant_id = v_tenant AND batch_label = 'B.Tech Sem 4' AND exam_type = 'MID_TERM'
  ORDER BY exam_date LIMIT 1;

  -- Full mark sheet for course-grades aggregate (Quiz 10 + Internal 10 + CAT1/2 30 + End 50).
  IF to_regclass('public.academic_marks') IS NOT NULL THEN
    INSERT INTO academic_marks (tenant_id, student_user_id, course_id, exam_type, marks_obtained, max_marks, status, published_at)
    SELECT v_tenant, m.student_user_id, v_course, m.exam_type, m.marks, m.max_marks, 'PUBLISHED', NOW() - INTERVAL '3 days'
    FROM (VALUES
      (v_student1, 'QUIZ'::varchar,     9::numeric,  10::numeric),
      (v_student1, 'INTERNAL',         9,           10),
      (v_student1, 'CAT1',            14,           15),
      (v_student1, 'CAT2',            13,           15),
      (v_student1, 'END_TERM',        42,          100),
      (v_student2, 'QUIZ',             8,           10),
      (v_student2, 'INTERNAL',         8,           10),
      (v_student2, 'CAT1',            12,           15),
      (v_student2, 'CAT2',            11,           15),
      (v_student2, 'END_TERM',        38,          100),
      (v_student3, 'QUIZ',             7,           10),
      (v_student3, 'INTERNAL',         7,           10),
      (v_student3, 'CAT1',            11,           15),
      (v_student3, 'CAT2',            10,           15),
      (v_student3, 'END_TERM',        35,          100),
      (v_student4, 'QUIZ',            10,           10),
      (v_student4, 'INTERNAL',        10,           10),
      (v_student4, 'CAT1',            15,           15),
      (v_student4, 'CAT2',            14,           15),
      (v_student4, 'END_TERM',        48,          100)
    ) AS m(student_user_id, exam_type, marks, max_marks)
    WHERE m.student_user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM academic_marks x
        WHERE x.tenant_id = v_tenant AND x.student_user_id = m.student_user_id
          AND x.course_id = v_course AND x.exam_type = m.exam_type
      );

    UPDATE academic_marks m
    SET marks_obtained = v.marks, max_marks = v.max_marks, status = 'PUBLISHED', published_at = NOW()
    FROM (VALUES
      (v_student1, 'QUIZ',     9,  10),
      (v_student1, 'INTERNAL', 9,  10),
      (v_student1, 'CAT1',    14,  15),
      (v_student1, 'CAT2',    13,  15),
      (v_student1, 'END_TERM',42, 100),
      (v_student2, 'QUIZ',     8,  10),
      (v_student2, 'INTERNAL', 8,  10),
      (v_student2, 'CAT1',    12,  15),
      (v_student2, 'CAT2',    11,  15),
      (v_student2, 'END_TERM',38, 100),
      (v_student3, 'QUIZ',     7,  10),
      (v_student3, 'INTERNAL', 7,  10),
      (v_student3, 'CAT1',    11,  15),
      (v_student3, 'CAT2',    10,  15),
      (v_student3, 'END_TERM',35, 100),
      (v_student4, 'QUIZ',    10,  10),
      (v_student4, 'INTERNAL',10,  10),
      (v_student4, 'CAT1',    15,  15),
      (v_student4, 'CAT2',    14,  15),
      (v_student4, 'END_TERM',48, 100)
    ) AS v(student_user_id, exam_type, marks, max_marks)
    WHERE m.tenant_id = v_tenant AND m.course_id = v_course
      AND m.student_user_id = v.student_user_id AND m.exam_type = v.exam_type;
  END IF;

  -- Completed enrollments with grades for grade-card SGPA/CGPA.
  IF to_regclass('public.student_course_enrollments') IS NOT NULL THEN
    UPDATE student_course_enrollments e
    SET status = 'COMPLETED', grade = v.grade, grade_points = v.gp
    FROM (VALUES
      (v_student1, 'B+'::varchar, 8.0::numeric),
      (v_student2, 'B',           7.0),
      (v_student3, 'C',           6.0),
      (v_student4, 'A',           9.0)
    ) AS v(user_id, grade, gp)
    WHERE e.tenant_id = v_tenant AND e.course_id = v_course AND e.semester = 4
      AND e.student_user_id = v.user_id AND v.user_id IS NOT NULL;
  END IF;

  -- Re-evaluation queue (paid applications in multiple workflow stages).
  IF v_subject IS NOT NULL AND to_regclass('public.exam_applications') IS NOT NULL THEN
    INSERT INTO exam_applications (
      exam_application_id, student_user_id, subject_id, application_type, fee_status, status,
      original_marks, revised_marks, report_notes, assigned_faculty_user_id,
      assigned_at, assigned_by, report_submitted_at, published_at, published_by, created_at
    )
    VALUES
      (
        'a1000001-0000-4000-8000-000000000001'::uuid,
        v_student2, v_subject, 'RE_EVALUATION', 'PAID', 'PENDING',
        38, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NOW() - INTERVAL '2 days'
      ),
      (
        'a1000002-0000-4000-8000-000000000002'::uuid,
        v_student4, v_subject, 'RE_EVALUATION', 'PAID', 'ASSIGNED',
        42, NULL, NULL, v_faculty1, NOW() - INTERVAL '1 day', v_examcell, NULL, NULL, NULL, NOW() - INTERVAL '3 days'
      ),
      (
        'a1000003-0000-4000-8000-000000000003'::uuid,
        v_student4, v_subject, 'RE_EVALUATION', 'PAID', 'UNDER_REVIEW',
        42, 46,
        'SMOKE: Reassessment confirms partial credit for Q3–Q5. Revised total 46/100.',
        v_faculty1, NOW() - INTERVAL '2 days', v_examcell, NOW() - INTERVAL '6 hours', NULL, NULL, NOW() - INTERVAL '4 days'
      ),
      (
        'a1000004-0000-4000-8000-000000000004'::uuid,
        v_student3, v_subject, 'RE_EVALUATION', 'PAID', 'COMPLETED',
        35, 41,
        'SMOKE: Re-evaluation completed — marginal improvement recorded.',
        v_faculty2, NOW() - INTERVAL '10 days', v_examcell, NOW() - INTERVAL '8 days',
        NOW() - INTERVAL '7 days', v_examcell, NOW() - INTERVAL '12 days'
      )
    ON CONFLICT (exam_application_id) DO UPDATE SET
      status = EXCLUDED.status,
      original_marks = EXCLUDED.original_marks,
      revised_marks = EXCLUDED.revised_marks,
      report_notes = EXCLUDED.report_notes,
      assigned_faculty_user_id = EXCLUDED.assigned_faculty_user_id,
      fee_status = EXCLUDED.fee_status;
  END IF;

  -- Published seating plans for student portal visibility.
  IF v_exam_mid IS NOT NULL AND to_regclass('public.exam_seating_plans') IS NOT NULL THEN
    DELETE FROM exam_seating_plans
    WHERE tenant_id = v_tenant AND exam_schedule_id = v_exam_mid AND room IN ('Hall 1', 'Hall 2');

    INSERT INTO exam_seating_plans (tenant_id, exam_schedule_id, room, seating_map, published)
    SELECT
      v_tenant,
      v_exam_mid,
      alloc.room,
      jsonb_agg(jsonb_build_object(
        'student_user_id', alloc.student_user_id,
        'seat_no', alloc.seat_number,
        'block', 'Block A'
      )),
      TRUE
    FROM exam_seating_allocations alloc
    WHERE alloc.tenant_id = v_tenant AND alloc.exam_schedule_id = v_exam_mid
    GROUP BY alloc.room;
  END IF;

  -- ABC IDs for DigiLocker-ready transcript demo (student4 clean; student2 has fee block only).
  IF to_regclass('public.student_profiles') IS NOT NULL THEN
    UPDATE student_profiles sp
    SET abc_id = v.abc
    FROM users u,
    (VALUES
      ('student2@mygyanvihar.com', 'ABC-2026-1002'),
      ('student4@mygyanvihar.com', 'ABC-2026-2002')
    ) AS v(email, abc)
    WHERE sp.user_id = u.user_id
      AND u.tenant_id = v_tenant
      AND lower(u.official_email) = v.email
      AND (sp.abc_id IS NULL OR sp.abc_id LIKE 'ABC-2026-%');
  END IF;

  -- Pending invigilation excuse so Exam Cell can demo approve/reject flow.
  IF v_exam_mid IS NOT NULL AND v_faculty2 IS NOT NULL
     AND to_regclass('public.invigilation_unavailability_requests') IS NOT NULL THEN
    INSERT INTO faculty_invigilation_assignments (
      assignment_id, tenant_id, faculty_user_id, exam_schedule_id, exam_date, block_name, room, session_label
    )
    SELECT
      v_assignment_pending,
      v_tenant,
      v_faculty2,
      v_exam_mid,
      es.exam_date,
      'Block A',
      'Hall 2',
      'SMOKE Mid Term — Pending excuse'
    FROM exam_schedules es
    WHERE es.exam_schedule_id = v_exam_mid
      AND NOT EXISTS (SELECT 1 FROM faculty_invigilation_assignments WHERE assignment_id = v_assignment_pending);

    INSERT INTO invigilation_unavailability_requests (
      request_id, tenant_id, assignment_id, faculty_user_id, reason, status
    )
    VALUES (
      'e0000002-0000-4000-8000-000000000002'::uuid,
      v_tenant,
      v_assignment_pending,
      v_faculty2,
      'SMOKE: Faculty2 requested swap — departmental accreditation visit on exam day.',
      'PENDING'
    )
    ON CONFLICT (request_id) DO UPDATE SET
      status = EXCLUDED.status,
      reason = EXCLUDED.reason;
  END IF;

  RAISE NOTICE 'Exam Cell demo completion smoke seeded';
END $$;

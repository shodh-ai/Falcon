-- Exam Cell Command Center smoke data (admit cards, seating, invigilation, dashboard).
-- Idempotent: safe to re-run on SGVU tenant after representative / result-control seeds.

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'exam-cell.command-center',
  'exam-cell',
  'examcell@mygyanvihar.com',
  'Command Center (Admit · Seating · Invigilation)',
  'Sem 4 audit matrix · seating run · leave conflict',
  'Populates admit-card audit, seating planner, invigilation roster, and dashboard counts for demo QA.'
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
  v_exam_mid UUID;
  v_exam_end UUID;
  v_assignment UUID := 'd0000001-0000-4000-8000-000000000001'::uuid;
  v_seating_run UUID := 'b0000001-0000-4000-8000-000000000001'::uuid;
  v_admit_run UUID := 'f0000001-0000-4000-8000-000000000001'::uuid;
  v_duty1 UUID := 'c0000001-0000-4000-8000-000000000001'::uuid;
  v_duty2 UUID := 'c0000002-0000-4000-8000-000000000002'::uuid;
  v_unavail UUID := 'e0000001-0000-4000-8000-000000000001'::uuid;
  v_exam_date DATE;
BEGIN
  SELECT tenant_id INTO v_tenant FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Skipping exam-cell command center smoke: tenant sgvu not found';
    RETURN;
  END IF;

  SELECT user_id INTO v_student1 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student2 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student2@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student3 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student3@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student4 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student4@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_faculty1 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_faculty2 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'faculty2@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_examcell FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'examcell@mygyanvihar.com' LIMIT 1;
  SELECT course_id INTO v_course FROM academic_courses WHERE tenant_id = v_tenant AND course_code = 'SMOKE101' LIMIT 1;

  IF v_student1 IS NULL OR v_course IS NULL THEN
    RAISE NOTICE 'Skipping exam-cell command center smoke: student1 or SMOKE101 missing';
    RETURN;
  END IF;

  -- Exam halls used by seating planner and invigilation roster.
  IF to_regclass('public.campus_spaces') IS NOT NULL THEN
    INSERT INTO campus_spaces (tenant_id, building_name, room_number, space_type, capacity, facilities, status)
    SELECT v_tenant, 'Block A', 'Hall 1', 'CLASSROOM', 120, '{"projector": true, "ac": true}'::jsonb, 'AVAILABLE'
    WHERE NOT EXISTS (
      SELECT 1 FROM campus_spaces WHERE tenant_id = v_tenant AND building_name = 'Block A' AND room_number = 'Hall 1'
    );

    INSERT INTO campus_spaces (tenant_id, building_name, room_number, space_type, capacity, facilities, status)
    SELECT v_tenant, 'Block A', 'Hall 2', 'CLASSROOM', 120, '{"projector": true, "ac": true}'::jsonb, 'AVAILABLE'
    WHERE NOT EXISTS (
      SELECT 1 FROM campus_spaces WHERE tenant_id = v_tenant AND building_name = 'Block A' AND room_number = 'Hall 2'
    );
  END IF;

  -- Ensure B.Tech Sem 4 schedules exist for admit-card batch label and seating.
  IF to_regclass('public.exam_schedules') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM exam_schedules WHERE tenant_id = v_tenant AND batch_label = 'B.Tech Sem 4' LIMIT 1) THEN
      INSERT INTO exam_schedules (tenant_id, exam_type, subject_id, exam_date, start_time, end_time, venue, max_marks, status, batch_label)
      SELECT
        v_tenant,
        v.exam_type,
        (SELECT subject_id FROM academic_subjects ORDER BY subject_id LIMIT 1),
        (CURRENT_DATE + v.days_offset)::date,
        '09:00'::time,
        '12:00'::time,
        'Block A Hall 1',
        v.max_marks,
        'SCHEDULED',
        'B.Tech Sem 4'
      FROM (VALUES
        ('MID_TERM'::varchar, 14, 50),
        ('END_TERM'::varchar, 28, 100)
      ) AS v(exam_type, days_offset, max_marks)
      WHERE EXISTS (SELECT 1 FROM academic_subjects LIMIT 1);
    END IF;

    SELECT exam_schedule_id, exam_date INTO v_exam_mid, v_exam_date
    FROM exam_schedules
    WHERE tenant_id = v_tenant AND exam_type = 'MID_TERM' AND batch_label = 'B.Tech Sem 4'
    ORDER BY exam_date
    LIMIT 1;

    IF v_exam_mid IS NULL THEN
      SELECT exam_schedule_id, exam_date INTO v_exam_mid, v_exam_date
      FROM exam_schedules WHERE tenant_id = v_tenant ORDER BY exam_date LIMIT 1;
    END IF;

    SELECT exam_schedule_id INTO v_exam_end
    FROM exam_schedules
    WHERE tenant_id = v_tenant AND exam_type = 'END_TERM' AND batch_label = 'B.Tech Sem 4'
    ORDER BY exam_date DESC
    LIMIT 1;

    IF v_exam_end IS NULL THEN
      v_exam_end := v_exam_mid;
    END IF;
  END IF;

  -- Semester 4 enrollments for admit-card audit matrix (varied attendance).
  IF to_regclass('public.student_course_enrollments') IS NOT NULL THEN
    INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, status, attendance_percent)
    SELECT v_tenant, u.user_id, v_course, 4, 'ENROLLED', u.att_pct
    FROM (VALUES
      (v_student1, 92.00::numeric),
      (v_student2, 88.00::numeric),
      (v_student3, 68.00::numeric),
      (v_student4, 95.00::numeric)
    ) AS u(user_id, att_pct)
    WHERE u.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM student_course_enrollments e
        WHERE e.tenant_id = v_tenant AND e.student_user_id = u.user_id AND e.course_id = v_course
      );

    UPDATE student_course_enrollments e
    SET semester = 4,
        attendance_percent = CASE u.official_email
          WHEN 'student1@mygyanvihar.com' THEN 92.00
          WHEN 'student2@mygyanvihar.com' THEN 88.00
          WHEN 'student3@mygyanvihar.com' THEN 68.00
          WHEN 'student4@mygyanvihar.com' THEN 95.00
          ELSE e.attendance_percent
        END,
        status = 'ENROLLED'
    FROM users u
    WHERE e.tenant_id = v_tenant
      AND e.course_id = v_course
      AND e.student_user_id = u.user_id
      AND lower(u.official_email) IN (
        'student1@mygyanvihar.com',
        'student2@mygyanvihar.com',
        'student3@mygyanvihar.com',
        'student4@mygyanvihar.com'
      );
  END IF;

  -- student2: pending fee dues (blocked in admit-card audit).
  IF v_student2 IS NOT NULL AND to_regclass('public.finance_fee_demands') IS NOT NULL THEN
    INSERT INTO finance_fee_demands (
      tenant_id, student_user_id, fee_head, academic_year, semester,
      total_amount, paid_amount, due_date, status, fee_breakup
    )
    SELECT
      v_tenant,
      v_student2,
      'SMOKE-EXAM-FEE-BLOCK',
      '2025-26',
      4,
      25000.00,
      10000.00,
      CURRENT_DATE + 7,
      'PARTIAL',
      '{"tuition": 25000}'::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM finance_fee_demands
      WHERE tenant_id = v_tenant AND student_user_id = v_student2 AND fee_head = 'SMOKE-EXAM-FEE-BLOCK'
    );
  END IF;

  -- Pending COE marks for results page / dashboard count.
  IF to_regclass('public.academic_marks') IS NOT NULL THEN
    INSERT INTO academic_marks (tenant_id, student_user_id, course_id, exam_type, marks_obtained, max_marks, status)
    SELECT v_tenant, v_student4, v_course, 'CAT2', 38, 50, 'PENDING_COE'
    WHERE v_student4 IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM academic_marks
        WHERE tenant_id = v_tenant AND student_user_id = v_student4 AND course_id = v_course AND exam_type = 'CAT2'
      );
  END IF;

  -- Seating planner: one saved allocation run with branch mix.
  IF v_exam_mid IS NOT NULL AND to_regclass('public.exam_seating_runs') IS NOT NULL THEN
    INSERT INTO exam_seating_runs (
      run_id, tenant_id, allocation_strategy, exam_type, exam_schedule_id, semester, branch, allocations, created_at
    )
    VALUES (
      v_seating_run,
      v_tenant,
      'by_schedule',
      'MID_TERM',
      v_exam_mid,
      4,
      'All Branches',
      COALESCE(
        (
          SELECT jsonb_agg(row ORDER BY ord)
          FROM (
            SELECT 1 AS ord, jsonb_build_object(
              'student_name', u.name,
              'student_user_id', u.user_id,
              'branch_code', COALESCE(d.dept_name, 'Computer Science'),
              'subject_name', 'Operating Systems',
              'exam_date', v_exam_date,
              'room', CASE WHEN row_number() OVER () % 2 = 1 THEN 'Hall 1' ELSE 'Hall 2' END,
              'seat_number', lpad((row_number() OVER ())::text, 2, '0')
            ) AS row
            FROM users u
            LEFT JOIN departments d ON d.dept_id = u.dept_id
            WHERE u.user_id IN (v_student1, v_student2, v_student3, v_student4)
              AND u.user_id IS NOT NULL
          ) sub
        ),
        '[]'::jsonb
      ),
      NOW() - INTERVAL '2 hours'
    )
    ON CONFLICT (run_id) DO UPDATE SET
      allocations = EXCLUDED.allocations,
      exam_schedule_id = EXCLUDED.exam_schedule_id,
      semester = EXCLUDED.semester;

    IF to_regclass('public.exam_seating_allocations') IS NOT NULL THEN
      INSERT INTO exam_seating_allocations (tenant_id, exam_schedule_id, room, student_user_id, seat_number, branch_code)
      SELECT v_tenant, v_exam_mid, alloc.room, alloc.student_user_id, alloc.seat_number, alloc.branch_code
      FROM (
        SELECT v_student1 AS student_user_id, 'Hall 1'::varchar AS room, '01'::varchar AS seat_number, 'Computer Science'::varchar AS branch_code
        UNION ALL SELECT v_student2, 'Hall 1', '02', 'Computer Science'
        UNION ALL SELECT v_student3, 'Hall 2', '01', 'Computer Science'
        UNION ALL SELECT v_student4, 'Hall 2', '02', 'Computer Science'
      ) alloc
      WHERE alloc.student_user_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM exam_seating_allocations a
          WHERE a.exam_schedule_id = v_exam_mid AND a.student_user_id = alloc.student_user_id
        );
    END IF;
  END IF;

  -- Invigilation roster + approved leave conflict for faculty1.
  IF v_exam_mid IS NOT NULL AND v_faculty1 IS NOT NULL AND to_regclass('public.exam_invigilation_duties') IS NOT NULL THEN
    INSERT INTO exam_invigilation_duties (duty_id, tenant_id, exam_schedule_id, room, faculty_user_id, status, published)
    VALUES
      (v_duty1, v_tenant, v_exam_mid, 'Hall 1', v_faculty1, 'ASSIGNED', TRUE),
      (v_duty2, v_tenant, v_exam_mid, 'Hall 2', COALESCE(v_faculty2, v_faculty1), 'ASSIGNED', TRUE)
    ON CONFLICT (duty_id) DO UPDATE SET
      exam_schedule_id = EXCLUDED.exam_schedule_id,
      room = EXCLUDED.room,
      faculty_user_id = EXCLUDED.faculty_user_id,
      published = EXCLUDED.published,
      status = EXCLUDED.status;

    IF to_regclass('public.faculty_invigilation_assignments') IS NOT NULL THEN
      INSERT INTO faculty_invigilation_assignments (
        assignment_id, tenant_id, faculty_user_id, exam_schedule_id, exam_date, block_name, room, session_label
      )
      VALUES (
        v_assignment,
        v_tenant,
        v_faculty1,
        v_exam_mid,
        COALESCE(v_exam_date, CURRENT_DATE + 14),
        'Block A',
        'Hall 1',
        'SMOKE Mid Term — Morning'
      )
      ON CONFLICT (assignment_id) DO UPDATE SET
        exam_schedule_id = EXCLUDED.exam_schedule_id,
        exam_date = EXCLUDED.exam_date,
        room = EXCLUDED.room;

      IF to_regclass('public.invigilation_unavailability_requests') IS NOT NULL THEN
        INSERT INTO invigilation_unavailability_requests (
          request_id, tenant_id, assignment_id, faculty_user_id, reason, status, exam_cell_comment
        )
        VALUES (
          v_unavail,
          v_tenant,
          v_assignment,
          v_faculty1,
          'SMOKE: Approved medical leave overlaps mid-term invigilation duty.',
          'APPROVED',
          'Approved — Exam Cell to re-assign Hall 1.'
        )
        ON CONFLICT (request_id) DO UPDATE SET
          status = EXCLUDED.status,
          reason = EXCLUDED.reason,
          exam_cell_comment = EXCLUDED.exam_cell_comment;
      END IF;
    END IF;
  END IF;

  -- Admit card generation history.
  IF to_regclass('public.exam_admit_card_runs') IS NOT NULL THEN
    INSERT INTO exam_admit_card_runs (
      run_id, tenant_id, batch_label, semester, generated_count, blocked_count, run_by, created_at
    )
    VALUES (
      v_admit_run,
      v_tenant,
      'B.Tech Sem 4',
      4,
      2,
      2,
      v_examcell,
      NOW() - INTERVAL '1 day'
    )
    ON CONFLICT (run_id) DO UPDATE SET
      generated_count = EXCLUDED.generated_count,
      blocked_count = EXCLUDED.blocked_count,
      batch_label = EXCLUDED.batch_label;
  END IF;

  RAISE NOTICE 'Exam Cell command center smoke data seeded for examcell@mygyanvihar.com';
END $$;

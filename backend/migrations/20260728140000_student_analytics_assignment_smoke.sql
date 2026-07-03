-- Smoke data for Faculty → Student Analytics assignment status dots (CS3101).
-- Mix of pending (red), submitted (green, awaiting grade), and graded (green + score on hover).

DO $$
DECLARE
  v_tenant UUID;
  v_course UUID;
  v_faculty UUID;
  v_aniket UUID;
  v_munmun UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'student_analytics_assignment_smoke: sgvu tenant missing, skipping';
    RETURN;
  END IF;

  SELECT course_id INTO v_course
  FROM academic_courses
  WHERE tenant_id = v_tenant AND course_code = 'CS3101'
  LIMIT 1;

  SELECT user_id INTO v_faculty
  FROM users
  WHERE tenant_id = v_tenant AND lower(official_email) = 'naman.raj@mygyanvihar.com'
  LIMIT 1;

  SELECT user_id INTO v_aniket
  FROM users
  WHERE tenant_id = v_tenant AND lower(official_email) = 'aniketsain45@gmail.com'
  LIMIT 1;

  SELECT user_id INTO v_munmun
  FROM users
  WHERE tenant_id = v_tenant AND lower(official_email) = 'munmun.2549711@mygyanvihar.com'
  LIMIT 1;

  IF v_course IS NULL OR v_faculty IS NULL THEN
    RAISE NOTICE 'student_analytics_assignment_smoke: CS3101 or faculty missing, skipping';
    RETURN;
  END IF;

  IF to_regclass('public.academic_assignments') IS NULL THEN
    RAISE NOTICE 'student_analytics_assignment_smoke: academic_assignments missing, skipping';
    RETURN;
  END IF;

  INSERT INTO academic_assignments (tenant_id, course_id, faculty_user_id, title, description, max_marks, due_date)
  SELECT v_tenant, v_course, v_faculty, seed.title, seed.description, seed.max_marks, seed.due_date
  FROM (VALUES
    (
      'SMOKE-ANALYTICS: AI Ethics Essay',
      'Short essay on ethical use of AI systems in campus workflows.',
      20,
      NOW() + INTERVAL '10 days'
    ),
    (
      'SMOKE-ANALYTICS: Search Algorithm Lab',
      'Implement BFS/DFS on a sample graph and upload the report.',
      25,
      NOW() + INTERVAL '5 days'
    ),
    (
      'SMOKE-ANALYTICS: Neural Network Basics',
      'Build a perceptron for binary classification.',
      30,
      NOW() - INTERVAL '2 days'
    ),
    (
      'SMOKE-ANALYTICS: Expert Systems Report',
      'Explain forward chaining with one real-world example.',
      20,
      NOW() + INTERVAL '14 days'
    ),
    (
      'SMOKE-ANALYTICS: Prolog Programming',
      'Solve family-tree queries using Prolog clauses.',
      15,
      NOW() - INTERVAL '7 days'
    ),
    (
      'SMOKE-ANALYTICS: Knowledge Representation Quiz',
      'Upload solutions for semantic network exercises.',
      10,
      NOW() + INTERVAL '3 days'
    )
  ) AS seed(title, description, max_marks, due_date)
  WHERE NOT EXISTS (
    SELECT 1 FROM academic_assignments aa
    WHERE aa.tenant_id = v_tenant
      AND aa.course_id = v_course
      AND aa.title = seed.title
  );

  IF v_aniket IS NOT NULL AND to_regclass('public.assignment_submissions') IS NOT NULL THEN
    -- Graded submissions (green dot + score on hover)
    INSERT INTO assignment_submissions (
      tenant_id, assignment_id, student_user_id, file_path, submitted_at,
      marks_awarded, faculty_remarks, status
    )
    SELECT v_tenant, aa.assignment_id, v_aniket, '/smoke/assignments/analytics-aniket.pdf',
           NOW() - INTERVAL '4 days', sub.marks_awarded, sub.faculty_remarks, 'GRADED'
    FROM academic_assignments aa
    JOIN (VALUES
      ('SMOKE-ANALYTICS: AI Ethics Essay',       17.0, 'Clear arguments and good citations.'),
      ('SMOKE-ANALYTICS: Search Algorithm Lab',  21.0, 'Correct traversal traces.'),
      ('SMOKE-ANALYTICS: Prolog Programming',    13.0, 'All clauses work as expected.')
    ) AS sub(title, marks_awarded, faculty_remarks) ON sub.title = aa.title
    WHERE aa.tenant_id = v_tenant AND aa.course_id = v_course
      AND NOT EXISTS (
        SELECT 1 FROM assignment_submissions s
        WHERE s.tenant_id = v_tenant
          AND s.assignment_id = aa.assignment_id
          AND s.student_user_id = v_aniket
      );

    -- Submitted but not graded yet (green dot, awaiting grade)
    INSERT INTO assignment_submissions (
      tenant_id, assignment_id, student_user_id, file_path, submitted_at, status
    )
    SELECT v_tenant, aa.assignment_id, v_aniket, '/smoke/assignments/analytics-aniket-pending-grade.pdf',
           NOW() - INTERVAL '1 day', 'SUBMITTED'
    FROM academic_assignments aa
    WHERE aa.tenant_id = v_tenant
      AND aa.course_id = v_course
      AND aa.title = 'SMOKE-ANALYTICS: Neural Network Basics'
      AND NOT EXISTS (
        SELECT 1 FROM assignment_submissions s
        WHERE s.tenant_id = v_tenant
          AND s.assignment_id = aa.assignment_id
          AND s.student_user_id = v_aniket
      );

    -- Expert Systems Report + Knowledge Representation Quiz left without submissions → red dots
  END IF;

  IF v_munmun IS NOT NULL AND to_regclass('public.assignment_submissions') IS NOT NULL THEN
    INSERT INTO assignment_submissions (
      tenant_id, assignment_id, student_user_id, file_path, submitted_at,
      marks_awarded, faculty_remarks, status
    )
    SELECT v_tenant, aa.assignment_id, v_munmun, '/smoke/assignments/analytics-munmun.pdf',
           NOW() - INTERVAL '3 days', sub.marks_awarded, sub.faculty_remarks, 'GRADED'
    FROM academic_assignments aa
    JOIN (VALUES
      ('SMOKE-ANALYTICS: AI Ethics Essay',      18.0, 'Well structured submission.'),
      ('SMOKE-ANALYTICS: Prolog Programming',   12.0, 'Minor syntax issues.')
    ) AS sub(title, marks_awarded, faculty_remarks) ON sub.title = aa.title
    WHERE aa.tenant_id = v_tenant AND aa.course_id = v_course
      AND NOT EXISTS (
        SELECT 1 FROM assignment_submissions s
        WHERE s.tenant_id = v_tenant
          AND s.assignment_id = aa.assignment_id
          AND s.student_user_id = v_munmun
      );

    INSERT INTO assignment_submissions (
      tenant_id, assignment_id, student_user_id, file_path, submitted_at, status
    )
    SELECT v_tenant, aa.assignment_id, v_munmun, '/smoke/assignments/analytics-munmun-submitted.pdf',
           NOW() - INTERVAL '2 days', 'SUBMITTED'
    FROM academic_assignments aa
    WHERE aa.tenant_id = v_tenant
      AND aa.course_id = v_course
      AND aa.title IN (
        'SMOKE-ANALYTICS: Search Algorithm Lab',
        'SMOKE-ANALYTICS: Neural Network Basics'
      )
      AND NOT EXISTS (
        SELECT 1 FROM assignment_submissions s
        WHERE s.tenant_id = v_tenant
          AND s.assignment_id = aa.assignment_id
          AND s.student_user_id = v_munmun
      );
  END IF;

  RAISE NOTICE 'student_analytics_assignment_smoke: CS3101 assignment smoke data seeded';
END $$;

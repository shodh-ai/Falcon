-- HOD team feedback: leave attachments, regularisation HR step, pharmacy timetable seed

ALTER TABLE staff_leave_requests
  ADD COLUMN IF NOT EXISTS supporting_doc_urls JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Regularisation: HOD (step 1) then HR (step 2)
INSERT INTO hr_approval_workflow_steps (workflow_id, step_order, approver_type, approver_ref)
SELECT w.workflow_id, 2, 'HR_EXECUTIVE', NULL
FROM hr_approval_workflows w
WHERE w.action_type = 'REGULARIZATION'
  AND NOT EXISTS (
    SELECT 1 FROM hr_approval_workflow_steps s
    WHERE s.workflow_id = w.workflow_id AND s.step_order = 2
  );

-- Pharmacy department timetable (faculty from Pharmacy dept only)
DO $$
DECLARE
  v_tenant UUID;
  v_dept INT;
  v_course UUID;
  v_fac1 UUID;
  v_fac2 UUID;
  v_fac3 UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM tenants LIMIT 1;
  SELECT dept_id INTO v_dept FROM departments WHERE dept_name = 'Pharmacy' LIMIT 1;
  IF v_dept IS NULL THEN RETURN; END IF;

  SELECT user_id INTO v_fac1 FROM users WHERE lower(official_email) = 'manish1.gupta@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_fac2 FROM users WHERE lower(official_email) = 'mahendra.saini@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_fac3 FROM users WHERE lower(official_email) = 'amit.kaushik@mygyanvihar.com' LIMIT 1;

  -- Ensure pharmacy faculty are mapped to Pharmacy dept (timetable filter uses u.dept_id)
  UPDATE users SET dept_id = v_dept
  WHERE user_id IN (v_fac1, v_fac2, v_fac3) AND (dept_id IS NULL OR dept_id != v_dept);

  INSERT INTO academic_courses (tenant_id, course_code, course_name, credits)
  SELECT v_tenant, 'PHR101', 'Pharmaceutics I', 4
  WHERE NOT EXISTS (SELECT 1 FROM academic_courses WHERE tenant_id = v_tenant AND course_code = 'PHR101')
  RETURNING course_id INTO v_course;

  IF v_course IS NULL THEN
    SELECT course_id INTO v_course FROM academic_courses WHERE tenant_id = v_tenant AND course_code = 'PHR101' LIMIT 1;
  END IF;

  IF v_course IS NOT NULL AND v_fac1 IS NOT NULL THEN
    INSERT INTO academic_timetables (tenant_id, course_id, faculty_user_id, day_of_week, start_time, end_time, room)
    SELECT v_tenant, v_course, v_fac1, d.dow, '09:00', '10:00', 'Pharmacy Block A-101'
    FROM (VALUES (1),(2),(3),(4),(5)) AS d(dow)
    WHERE NOT EXISTS (
      SELECT 1 FROM academic_timetables t
      WHERE t.tenant_id = v_tenant AND t.course_id = v_course AND t.faculty_user_id = v_fac1 AND t.day_of_week = d.dow
    );
  END IF;

  INSERT INTO academic_courses (tenant_id, course_code, course_name, credits)
  SELECT v_tenant, 'PHR102', 'Pharmaceutical Chemistry', 4
  WHERE NOT EXISTS (SELECT 1 FROM academic_courses WHERE tenant_id = v_tenant AND course_code = 'PHR102')
  RETURNING course_id INTO v_course;

  IF v_course IS NULL THEN
    SELECT course_id INTO v_course FROM academic_courses WHERE tenant_id = v_tenant AND course_code = 'PHR102' LIMIT 1;
  END IF;

  IF v_course IS NOT NULL AND v_fac2 IS NOT NULL THEN
    INSERT INTO academic_timetables (tenant_id, course_id, faculty_user_id, day_of_week, start_time, end_time, room)
    SELECT v_tenant, v_course, v_fac2, d.dow, '11:00', '12:00', 'Pharmacy Block A-102'
    FROM (VALUES (1),(3),(5)) AS d(dow)
    WHERE NOT EXISTS (
      SELECT 1 FROM academic_timetables t
      WHERE t.tenant_id = v_tenant AND t.course_id = v_course AND t.faculty_user_id = v_fac2 AND t.day_of_week = d.dow
    );
  END IF;

  INSERT INTO academic_courses (tenant_id, course_code, course_name, credits)
  SELECT v_tenant, 'PHR103', 'Pharmacology', 4
  WHERE NOT EXISTS (SELECT 1 FROM academic_courses WHERE tenant_id = v_tenant AND course_code = 'PHR103')
  RETURNING course_id INTO v_course;

  IF v_course IS NULL THEN
    SELECT course_id INTO v_course FROM academic_courses WHERE tenant_id = v_tenant AND course_code = 'PHR103' LIMIT 1;
  END IF;

  IF v_course IS NOT NULL AND v_fac3 IS NOT NULL THEN
    INSERT INTO academic_timetables (tenant_id, course_id, faculty_user_id, day_of_week, start_time, end_time, room)
    SELECT v_tenant, v_course, v_fac3, d.dow, '14:00', '15:00', 'Pharmacy Lab L-1'
    FROM (VALUES (2),(4),(6)) AS d(dow)
    WHERE NOT EXISTS (
      SELECT 1 FROM academic_timetables t
      WHERE t.tenant_id = v_tenant AND t.course_id = v_course AND t.faculty_user_id = v_fac3 AND t.day_of_week = d.dow
    );
  END IF;
END $$;

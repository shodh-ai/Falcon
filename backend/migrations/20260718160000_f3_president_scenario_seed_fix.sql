-- F.3 President scenario simulation — repair missing chain prerequisites (idempotent)

DO $$
DECLARE
  v_tenant UUID := 'a0000000-0000-4000-8000-000000000001';
  v_hod UUID;
  v_student UUID;
  v_dept_id INT;
  v_budget_id UUID;
  v_univ_budget UUID;
  v_event_id UUID := 'f3000010-0000-4000-8000-000000000001';
  v_app_id UUID := 'f3000011-0000-4000-8000-000000000001';
  v_task_id INT;
  v_iqac_role INT;
  v_assignee UUID;
BEGIN
  SELECT user_id INTO v_hod FROM users
  WHERE tenant_id = v_tenant AND lower(official_email) = 'hod@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student FROM users u
  JOIN roles r ON r.role_id = u.role_id
  WHERE u.tenant_id = v_tenant AND r.role_name = 'Student' AND u.is_active = true
  ORDER BY u.created_at DESC LIMIT 1;
  SELECT dept_id INTO v_dept_id FROM departments ORDER BY dept_id LIMIT 1;

  IF v_dept_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM fin_dept_budgets WHERE tenant_id = v_tenant
  ) THEN
    INSERT INTO fin_university_budgets (university_budget_id, tenant_id, financial_year, total_allocated, status)
    VALUES ('f3000005-0000-4000-8000-000000000001', v_tenant, '2026-27', 50000000, 'LOCKED')
    ON CONFLICT (tenant_id, financial_year) DO NOTHING;

    SELECT university_budget_id INTO v_univ_budget FROM fin_university_budgets
    WHERE tenant_id = v_tenant AND financial_year = '2026-27' LIMIT 1;

    INSERT INTO fin_dept_budgets
      (budget_id, tenant_id, university_budget_id, financial_year, department_id,
       allocated_amount, utilized_amount, status)
    VALUES
      ('f3000006-0000-4000-8000-000000000001', v_tenant, v_univ_budget, '2026-27', v_dept_id,
       12000000, 4500000, 'ACTIVE')
    ON CONFLICT (tenant_id, department_id, financial_year) DO NOTHING;
  END IF;

  SELECT budget_id INTO v_budget_id FROM fin_dept_budgets
  WHERE tenant_id = v_tenant ORDER BY allocated_amount DESC NULLS LAST LIMIT 1;

  IF v_budget_id IS NOT NULL AND v_hod IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM fin_budget_expansion_requests
    WHERE tenant_id = v_tenant AND status = 'PENDING'
  ) THEN
    INSERT INTO fin_budget_expansion_requests
      (request_id, tenant_id, budget_id, requested_amount, reason, status, requested_by)
    VALUES
      ('f3000001-0000-4000-8000-000000000001', v_tenant, v_budget_id, 2500000,
       'F.3 scenario — annual lab infrastructure budget expansion', 'PENDING', v_hod)
    ON CONFLICT (request_id) DO NOTHING;
  END IF;

  IF v_hod IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM executive_hr_approval_requests
    WHERE tenant_id = v_tenant AND status = 'PENDING'
  ) THEN
    INSERT INTO executive_hr_approval_requests
      (request_id, tenant_id, request_type, title, payload, amount, requested_by, status)
    VALUES
      ('f3000003-0000-4000-8000-000000000001', v_tenant, 'HIRING',
       'F.3 scenario — Associate Professor (ECE) hiring approval',
       '{"positions":1,"department_name":"Electronics","candidate_name":"Dr Scenario Two"}'::jsonb,
       1400000, v_hod, 'PENDING')
    ON CONFLICT (request_id) DO NOTHING;
  END IF;

  IF v_student IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM cert_events WHERE event_id = v_event_id
  ) THEN
    INSERT INTO cert_events
      (event_id, tenant_id, event_name, application_start_date, application_end_date, base_fee, is_active)
    VALUES
      (v_event_id, v_tenant, 'Convocation 2026',
       CURRENT_DATE - 30, CURRENT_DATE + 60, 1500, true);
  END IF;

  IF v_student IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM cert_applications WHERE application_id = v_app_id
  ) THEN
    INSERT INTO cert_applications
      (application_id, tenant_id, event_id, student_user_id, verification_status,
       president_ratification_status, certificate_generated)
    VALUES
      (v_app_id, v_tenant, v_event_id, v_student, 'VERIFIED', 'PENDING', false);
  END IF;

  SELECT role_id INTO v_iqac_role FROM roles WHERE role_name = 'IQAC' LIMIT 1;
  SELECT user_id INTO v_assignee FROM users
  WHERE tenant_id = v_tenant AND is_active = true
  ORDER BY created_at DESC LIMIT 1;

  IF v_iqac_role IS NOT NULL AND v_assignee IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM task_master WHERE task_name = 'F.3 NAAC compliance evidence pack'
  ) THEN
    INSERT INTO task_master (role_id, task_name, task_description, is_recurring, month)
    VALUES (v_iqac_role, 'F.3 NAAC compliance evidence pack',
            'President scenario E — IQAC compliance investigation task', false, 'July')
    RETURNING task_id INTO v_task_id;
  END IF;

  SELECT task_id INTO v_task_id FROM task_master
  WHERE task_name = 'F.3 NAAC compliance evidence pack' LIMIT 1;

  IF v_task_id IS NOT NULL AND v_assignee IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM task_assignments ta
    JOIN users u ON u.user_id = ta.assigned_to
    WHERE u.tenant_id = v_tenant AND ta.status = 'Pending'
  ) THEN
    INSERT INTO task_assignments (task_id, assigned_to, status, due_date)
    VALUES (v_task_id, v_assignee, 'Pending', CURRENT_DATE + 7);
  END IF;
END $$;

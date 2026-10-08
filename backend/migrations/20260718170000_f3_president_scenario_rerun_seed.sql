-- F.3 scenario re-run seed — restore consumable executive workflow fixtures

DO $$
DECLARE
  v_tenant UUID := 'a0000000-0000-4000-8000-000000000001';
  v_hod UUID;
  v_budget_id UUID;
  v_task_id INT;
  v_assignee UUID;
BEGIN
  SELECT user_id INTO v_hod FROM users
  WHERE tenant_id = v_tenant AND lower(official_email) = 'hod@mygyanvihar.com' LIMIT 1;
  SELECT budget_id INTO v_budget_id FROM fin_dept_budgets
  WHERE tenant_id = v_tenant ORDER BY allocated_amount DESC NULLS LAST LIMIT 1;

  IF v_budget_id IS NOT NULL AND v_hod IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM fin_budget_expansion_requests
    WHERE tenant_id = v_tenant AND status = 'PENDING'
  ) THEN
    INSERT INTO fin_budget_expansion_requests
      (request_id, tenant_id, budget_id, requested_amount, reason, status, requested_by)
    VALUES
      ('f3000007-0000-4000-8000-000000000001', v_tenant, v_budget_id, 2100000,
       'F.3 re-run — annual operations budget expansion', 'PENDING', v_hod)
    ON CONFLICT (request_id) DO NOTHING;
  END IF;

  IF v_hod IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM executive_hr_approval_requests
    WHERE tenant_id = v_tenant AND status = 'PENDING'
  ) THEN
    INSERT INTO executive_hr_approval_requests
      (request_id, tenant_id, request_type, title, payload, amount, requested_by, status)
    VALUES
      ('f3000008-0000-4000-8000-000000000001', v_tenant, 'HIRING',
       'F.3 re-run — Professor (Mechanical) hiring approval',
       '{"positions":1,"department_name":"Mechanical","candidate_name":"Dr Scenario Three"}'::jsonb,
       1600000, v_hod, 'PENDING')
    ON CONFLICT (request_id) DO NOTHING;
  END IF;

  UPDATE cert_applications
  SET president_ratification_status = 'PENDING',
      president_ratified_at = NULL,
      president_ratified_by = NULL,
      certificate_generated = false,
      certificate_url = NULL,
      updated_at = NOW()
  WHERE application_id = 'f3000011-0000-4000-8000-000000000001'
    AND tenant_id = v_tenant;

  SELECT task_id INTO v_task_id FROM task_master
  WHERE task_name = 'F.3 NAAC compliance evidence pack' LIMIT 1;
  SELECT user_id INTO v_assignee FROM users
  WHERE tenant_id = v_tenant AND is_active = true
  ORDER BY created_at DESC LIMIT 1;

  IF v_task_id IS NOT NULL AND v_assignee IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM task_assignments ta
    JOIN users u ON u.user_id = ta.assigned_to
    WHERE u.tenant_id = v_tenant AND ta.status = 'Pending'
  ) THEN
    INSERT INTO task_assignments (task_id, assigned_to, status, due_date)
    VALUES (v_task_id, v_assignee, 'Pending', CURRENT_DATE + 7);
  END IF;
END $$;

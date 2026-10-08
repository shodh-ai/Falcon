-- F.3 President scenario simulation seed (idempotent)

DO $$
DECLARE
  v_tenant UUID := 'a0000000-0000-4000-8000-000000000001';
  v_hod UUID;
  v_finance UUID;
  v_budget_id UUID;
  v_task_id INT;
  v_assignee UUID;
BEGIN
  SELECT user_id INTO v_hod FROM users
  WHERE tenant_id = v_tenant AND lower(official_email) = 'hod@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_finance FROM users
  WHERE tenant_id = v_tenant AND lower(official_email) = 'finance@mygyanvihar.com' LIMIT 1;
  SELECT budget_id INTO v_budget_id FROM fin_dept_budgets
  WHERE tenant_id = v_tenant ORDER BY allocated_amount DESC NULLS LAST LIMIT 1;

  IF NOT EXISTS (
    SELECT 1 FROM fin_budget_expansion_requests
    WHERE tenant_id = v_tenant AND status = 'PENDING'
  ) AND v_budget_id IS NOT NULL AND v_hod IS NOT NULL THEN
    INSERT INTO fin_budget_expansion_requests
      (request_id, tenant_id, budget_id, requested_amount, reason, status, requested_by)
    VALUES
      ('f3000001-0000-4000-8000-000000000001', v_tenant, v_budget_id, 2500000,
       'F.3 scenario — annual lab infrastructure budget expansion', 'PENDING', v_hod);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM executive_hr_approval_requests
    WHERE tenant_id = v_tenant AND status = 'PENDING'
  ) AND v_hod IS NOT NULL THEN
    INSERT INTO executive_hr_approval_requests
      (request_id, tenant_id, request_type, title, payload, amount, requested_by, status)
    VALUES
      ('f3000002-0000-4000-8000-000000000001', v_tenant, 'HIRING',
       'F.3 scenario — Assistant Professor (CSE) hiring approval',
       '{"positions":1,"department_name":"Computer Science","candidate_name":"Dr Scenario Hire"}'::jsonb,
       1200000, v_hod, 'PENDING');
  END IF;

  SELECT task_id INTO v_task_id FROM task_master ORDER BY task_id DESC LIMIT 1;
  SELECT user_id INTO v_assignee FROM users
  WHERE tenant_id = v_tenant AND is_active = true
  ORDER BY created_at DESC LIMIT 1;

  IF v_task_id IS NOT NULL AND v_assignee IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM task_assignments ta
    JOIN users u ON u.user_id = ta.assigned_to
    WHERE u.tenant_id = v_tenant AND ta.status = 'Pending'
  ) THEN
    INSERT INTO task_assignments (task_id, assigned_to, status, due_date)
    VALUES (v_task_id, v_assignee, 'Pending', CURRENT_DATE + 7)
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE cert_applications
  SET verification_status = 'VERIFIED',
      president_ratification_status = 'PENDING',
      certificate_generated = false,
      updated_at = NOW()
  WHERE application_id = (
    SELECT application_id FROM cert_applications
    WHERE tenant_id = v_tenant
    ORDER BY updated_at DESC
    LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM cert_applications
    WHERE tenant_id = v_tenant
      AND verification_status = 'VERIFIED'
      AND president_ratification_status = 'PENDING'
      AND certificate_generated = false
  );
END $$;

-- Leadership Executive smoke seed — Chairman portal demo data (idempotent)
-- Login: chairman@mygyanvihar.com / password123 (tenant sgvu)

CREATE UNIQUE INDEX IF NOT EXISTS dept_financial_scores_tenant_dept_date
  ON dept_financial_scores (tenant_id, department_id, score_date);

DO $$
DECLARE
  v_tenant UUID := 'a0000000-0000-4000-8000-000000000001';
  v_chairman UUID := 'c0000001-0000-4000-8000-000000000001';
  v_finance UUID;
  v_hod UUID;
  v_student1 UUID;
  v_dept_id INT;
  v_budget_id UUID;
  v_doc_land UUID := 'e0000001-0000-4000-8000-000000000001';
  v_doc_trust UUID := 'e0000001-0000-4000-8000-000000000002';
  v_mou_tcs UUID := 'e0000002-0000-4000-8000-000000000001';
  v_mou_mit UUID := 'e0000002-0000-4000-8000-000000000002';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE tenant_id = v_tenant) THEN
    RAISE NOTICE 'leadership smoke seed skipped — sgvu tenant missing';
    RETURN;
  END IF;

  SELECT user_id INTO v_finance FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'finance@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_hod FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'hod@mygyanvihar.com' LIMIT 1;
  SELECT user_id INTO v_student1 FROM users WHERE tenant_id = v_tenant AND lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1;

  v_finance := COALESCE(v_finance, v_chairman);
  v_hod := COALESCE(v_hod, v_chairman);
  v_student1 := COALESCE(v_student1, v_chairman);

  SELECT dept_id INTO v_dept_id FROM departments ORDER BY dept_id LIMIT 1;
  SELECT budget_id INTO v_budget_id FROM fin_dept_budgets WHERE tenant_id = v_tenant ORDER BY allocated_amount DESC NULLS LAST LIMIT 1;

  -- Approval inbox: finance
  INSERT INTO fin_approval_requests (approval_id, tenant_id, entity_type, entity_id, requested_by, status, required_role, amount)
  VALUES
    ('e0000010-0000-4000-8000-000000000001', v_tenant, 'VENDOR_INVOICE', 'e0000011-0000-4000-8000-000000000001', v_finance, 'PENDING', 'CFO_OR_CHAIRMAN', 2850000),
    ('e0000010-0000-4000-8000-000000000002', v_tenant, 'PURCHASE_ORDER', 'e0000011-0000-4000-8000-000000000002', v_finance, 'PENDING', 'CFO_OR_CHAIRMAN', 1250000)
  ON CONFLICT (tenant_id, entity_type, entity_id) DO NOTHING;

  -- Approval inbox: budget expansion
  IF v_budget_id IS NOT NULL THEN
    INSERT INTO fin_budget_expansion_requests (request_id, tenant_id, budget_id, requested_amount, reason, status, requested_by)
    VALUES
      ('e0000012-0000-4000-8000-000000000001', v_tenant, v_budget_id, 3500000, 'CSE lab equipment — AI/ML cluster expansion', 'PENDING', v_hod)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Fee waivers
  INSERT INTO executive_fee_waiver_requests (request_id, tenant_id, student_user_id, requested_by, waiver_amount, reason, status)
  VALUES
    ('e0000013-0000-4000-8000-000000000001', v_tenant, v_student1, v_hod, 45000, 'Merit-cum-means waiver — first year CSE', 'PENDING'),
    ('e0000013-0000-4000-8000-000000000002', v_tenant, v_student1, v_finance, 120000, 'Sibling discount override — board approval required', 'PENDING')
  ON CONFLICT DO NOTHING;

  -- HR approvals
  INSERT INTO executive_hr_approval_requests (request_id, tenant_id, request_type, title, payload, amount, requested_by, status)
  VALUES
    ('e0000014-0000-4000-8000-000000000001', v_tenant, 'HIRING', 'Bulk faculty hiring — School of Engineering (8 positions)', '{"positions":8,"school":"Engineering"}'::jsonb, 9600000, v_hod, 'PENDING'),
    ('e0000014-0000-4000-8000-000000000002', v_tenant, 'BONUS_ALLOCATION', 'Festival bonus batch — non-teaching staff', '{"headcount":42}'::jsonb, 840000, v_finance, 'PENDING')
  ON CONFLICT DO NOTHING;

  -- Academic approvals
  INSERT INTO executive_academic_approval_requests (request_id, tenant_id, request_type, title, payload, requested_by, status)
  VALUES
    ('e0000015-0000-4000-8000-000000000001', v_tenant, 'NEW_PROGRAM', 'B.Tech Artificial Intelligence & Data Science — intake 120', '{"intake":120,"school":"Engineering"}'::jsonb, v_hod, 'PENDING'),
    ('e0000015-0000-4000-8000-000000000002', v_tenant, 'FEE_STRUCTURE', 'Revised MBA fee structure FY 2026-27', '{"program":"MBA","revision_pct":8}'::jsonb, v_finance, 'PENDING')
  ON CONFLICT DO NOTHING;

  -- Executive tasks
  INSERT INTO executive_tasks (task_id, tenant_id, title, description, priority, status, assigned_to, assigned_by, due_at)
  VALUES
    ('e0000016-0000-4000-8000-000000000001', v_tenant, 'Review NAAC SSR draft', 'Final read-through before submission to IQAC', 'CRITICAL', 'OPEN', v_hod, v_chairman, NOW() + INTERVAL '3 days'),
    ('e0000016-0000-4000-8000-000000000002', v_tenant, 'Approve campus expansion MoU', 'Legal review complete — sign-off needed', 'HIGH', 'OVERDUE', v_finance, v_chairman, NOW() - INTERVAL '2 days'),
    ('e0000016-0000-4000-8000-000000000003', v_tenant, 'Board meeting agenda pack', 'Compile Q1 financials and placement report', 'HIGH', 'IN_PROGRESS', v_finance, v_chairman, NOW() + INTERVAL '7 days')
  ON CONFLICT DO NOTHING;

  -- Memos
  INSERT INTO executive_memos (memo_id, tenant_id, subject, body, confidential, audience_roles, sent_by, sent_at)
  VALUES
    ('e0000017-0000-4000-8000-000000000001', v_tenant, 'Directive: Fee collection drive — March', 'All Deans to ensure 85% collection by month-end. Daily defaulter report to Chairman office.', true, ARRAY['Dean', 'HOD'], v_chairman, NOW() - INTERVAL '2 days'),
    ('e0000017-0000-4000-8000-000000000002', v_tenant, 'Confidential: Board budget reallocation', 'Shift ₹2 Cr from Marketing OPEX to Infrastructure CAPEX pending board ratification.', true, ARRAY['Dean'], v_chairman, NOW() - INTERVAL '5 hours')
  ON CONFLICT DO NOTHING;

  -- Broadcasts
  INSERT INTO executive_broadcasts (broadcast_id, tenant_id, subject, body, channels, audience_filter, sent_by, recipient_count, sent_at)
  VALUES
    ('e0000018-0000-4000-8000-000000000001', v_tenant, 'Convocation 2026 — Save the Date', 'Annual convocation scheduled for 15 August 2026. Formal invitation follows.', ARRAY['EMAIL', 'PUSH'], '{"role":"Student"}'::jsonb, v_chairman, 4200, NOW() - INTERVAL '1 day'),
    ('e0000018-0000-4000-8000-000000000002', v_tenant, 'Campus maintenance shutdown — Block B', 'Electrical maintenance 22–23 June. Classes relocated per registrar notice.', ARRAY['EMAIL'], '{"role":"Faculty"}'::jsonb, v_chairman, 380, NOW() - INTERVAL '6 hours')
  ON CONFLICT DO NOTHING;

  -- Vault documents
  INSERT INTO executive_documents (document_id, tenant_id, title, category, storage_key, version, expires_at, uploaded_by)
  VALUES
    (v_doc_land, v_tenant, 'Main Campus Land Deed — Jaipur', 'LAND_DEED', 'vault/sgvu/land-deed-main-campus.pdf', 3, (CURRENT_DATE + INTERVAL '5 years')::date, v_chairman),
    (v_doc_trust, v_tenant, 'Trust Deed & 80G Registration', 'TRUST', 'vault/sgvu/trust-deed-80g.pdf', 2, NULL, v_chairman)
  ON CONFLICT DO NOTHING;

  INSERT INTO executive_document_access_logs (log_id, document_id, user_id, action, ip_address, created_at)
  SELECT * FROM (VALUES
    ('e0000019-0000-4000-8000-000000000001'::uuid, v_doc_land, v_chairman, 'VIEW', '127.0.0.1', NOW() - INTERVAL '1 hour'),
    ('e0000019-0000-4000-8000-000000000002'::uuid, v_doc_land, v_finance, 'VIEW', '10.0.0.12', NOW() - INTERVAL '3 hours'),
    ('e0000019-0000-4000-8000-000000000003'::uuid, v_doc_trust, v_chairman, 'DOWNLOAD', '127.0.0.1', NOW() - INTERVAL '2 days')
  ) AS t(log_id, document_id, user_id, action, ip_address, created_at)
  WHERE NOT EXISTS (SELECT 1 FROM executive_document_access_logs WHERE log_id = t.log_id);

  -- MoU tracker
  INSERT INTO executive_mou_tracker (mou_id, tenant_id, partner_name, mou_type, signed_on, expires_on, status, notes)
  VALUES
    (v_mou_tcs, v_tenant, 'TCS Campus Recruitment', 'CORPORATE', (CURRENT_DATE - INTERVAL '2 years')::date, (CURRENT_DATE + INTERVAL '20 days')::date, 'ACTIVE', 'Renewal discussion in progress — RENEWAL ALERT'),
    (v_mou_mit, v_tenant, 'MIT Pune — Student Exchange', 'INTERNATIONAL', (CURRENT_DATE - INTERVAL '1 year')::date, (CURRENT_DATE + INTERVAL '14 months')::date, 'ACTIVE', 'Dual credit program'),
    ('e0000002-0000-4000-8000-000000000003', v_tenant, 'Rajasthan Govt — Skill Development', 'GOVERNMENT', (CURRENT_DATE - INTERVAL '6 months')::date, (CURRENT_DATE + INTERVAL '18 months')::date, 'ACTIVE', 'RSLDC partnership')
  ON CONFLICT DO NOTHING;

  -- VIP contacts
  INSERT INTO vip_contacts (contact_id, tenant_id, full_name, organization, contact_type, email, pipeline_stage, pledged_amount, last_touch_at)
  VALUES
    ('e0000020-0000-4000-8000-000000000001', v_tenant, 'Rajesh Mehta', 'Mehta Industries', 'HNI', 'rajesh.mehta@example.com', 'PLEDGED', 5000000, NOW() - INTERVAL '2 days'),
    ('e0000020-0000-4000-8000-000000000002', v_tenant, 'Priya Sharma', 'Infosys Foundation', 'CSR', 'priya.sharma@infosys.com', 'PITCHED', 2500000, NOW() - INTERVAL '5 days'),
    ('e0000020-0000-4000-8000-000000000003', v_tenant, 'Dr. Anil Kapoor', 'Rajasthan Legislative Assembly', 'POLITICIAN', NULL, 'PROSPECTED', NULL, NOW() - INTERVAL '14 days'),
    ('e0000020-0000-4000-8000-000000000004', v_tenant, 'Sarah Chen', 'Microsoft India', 'RECRUITER', 'sarah.chen@microsoft.com', 'RECEIVED', 1000000, NOW() - INTERVAL '30 days'),
    ('e0000020-0000-4000-8000-000000000005', v_tenant, 'Vikram Singh', 'Singh Family Trust', 'HNI', 'vikram@example.com', 'DORMANT', 0, NOW() - INTERVAL '120 days')
  ON CONFLICT DO NOTHING;

  -- Compliance calendar
  INSERT INTO compliance_calendar_events (event_id, tenant_id, title, event_type, due_date, status, notes)
  VALUES
    ('e0000021-0000-4000-8000-000000000001', v_tenant, 'NAAC SSR Submission Window', 'ACCREDITATION', (CURRENT_DATE + INTERVAL '45 days')::date, 'UPCOMING', 'IQAC coordinating evidence pack'),
    ('e0000021-0000-4000-8000-000000000002', v_tenant, 'GST Return — GSTR-3B', 'TAX_FILING', (CURRENT_DATE + INTERVAL '8 days')::date, 'UPCOMING', 'Finance team preparing reconciliation'),
    ('e0000021-0000-4000-8000-000000000003', v_tenant, 'Fire Safety Inspection — Hostel Block', 'INSPECTION', (CURRENT_DATE + INTERVAL '3 days')::date, 'IN_PROGRESS', 'Warden coordinating with estate office'),
    ('e0000021-0000-4000-8000-000000000004', v_tenant, 'Statutory Audit — FY 2025-26', 'AUDIT', (CURRENT_DATE + INTERVAL '60 days')::date, 'UPCOMING', 'External auditor shortlisted')
  ON CONFLICT DO NOTHING;

  -- Financial oversight: debt & FD
  INSERT INTO fin_debt_facilities (facility_id, tenant_id, lender_name, purpose, principal_amount, principal_remaining, interest_rate_pct, emi_amount, next_emi_date, status)
  VALUES
    ('e0000022-0000-4000-8000-000000000001', v_tenant, 'SBI — Campus Expansion Term Loan', 'New academic block construction', 250000000, 198000000, 8.75, 2850000, (CURRENT_DATE + INTERVAL '12 days')::date, 'ACTIVE'),
    ('e0000022-0000-4000-8000-000000000002', v_tenant, 'HDFC — Equipment Finance', 'Lab instruments FY25', 45000000, 12000000, 9.25, 890000, (CURRENT_DATE + INTERVAL '5 days')::date, 'ACTIVE')
  ON CONFLICT DO NOTHING;

  INSERT INTO fin_fixed_deposits (fd_id, tenant_id, bank_name, principal, interest_rate_pct, maturity_date, interest_yielded, status)
  VALUES
    ('e0000023-0000-4000-8000-000000000001', v_tenant, 'ICICI Bank — Corporate FD', 85000000, 7.10, (CURRENT_DATE + INTERVAL '8 months')::date, 2100000, 'ACTIVE'),
    ('e0000023-0000-4000-8000-000000000002', v_tenant, 'Axis Bank — Treasury FD', 42000000, 6.85, (CURRENT_DATE + INTERVAL '14 months')::date, 980000, 'ACTIVE')
  ON CONFLICT DO NOTHING;

  -- Intelligence feed events
  INSERT INTO leadership_feed_events (event_id, tenant_id, event_type, label, amount, metadata, created_at)
  VALUES
    ('e0000024-0000-4000-8000-000000000001', v_tenant, 'INCOME', 'Tuition fee — CSE Batch 2025 (bulk)', 840000, '{}'::jsonb, NOW() - INTERVAL '15 minutes'),
    ('e0000024-0000-4000-8000-000000000002', v_tenant, 'INCOME', 'Hostel fee — Manikarnika Block A', 125000, '{}'::jsonb, NOW() - INTERVAL '32 minutes'),
    ('e0000024-0000-4000-8000-000000000003', v_tenant, 'EXPENSE', 'Vendor payout — Dell Computers (Lab PO)', 750000, '{}'::jsonb, NOW() - INTERVAL '48 minutes'),
    ('e0000024-0000-4000-8000-000000000004', v_tenant, 'EXPENSE', 'Electricity — Campus Block B', 210000, '{}'::jsonb, NOW() - INTERVAL '1 hour'),
    ('e0000024-0000-4000-8000-000000000005', v_tenant, 'ALERT', 'Marketing dept at 84% budget — soft warning', NULL, '{"severity":"YELLOW","department":"Marketing"}'::jsonb, NOW() - INTERVAL '2 hours'),
    ('e0000024-0000-4000-8000-000000000006', v_tenant, 'INCOME', 'Transport fee collection — Route A', 68000, '{}'::jsonb, NOW() - INTERVAL '3 hours'),
    ('e0000024-0000-4000-8000-000000000007', v_tenant, 'ALERT', 'Fee defaulters crossed 120 students', NULL, '{"severity":"RED"}'::jsonb, NOW() - INTERVAL '4 hours'),
    ('e0000024-0000-4000-8000-000000000008', v_tenant, 'EXPENSE', 'Payroll batch — teaching staff', 4200000, '{}'::jsonb, NOW() - INTERVAL '6 hours')
  ON CONFLICT DO NOTHING;

  -- Department financial scores (for intelligence Q4)
  IF v_dept_id IS NOT NULL THEN
    INSERT INTO dept_financial_scores (score_id, tenant_id, department_id, score_date, total_score, budget_adherence, roi_score, receivables_score)
    VALUES
      ('e0000025-0000-4000-8000-000000000001', v_tenant, v_dept_id, CURRENT_DATE, 78.5, 82.0, 74.0, 79.0)
    ON CONFLICT (tenant_id, department_id, score_date) DO UPDATE SET
      total_score = EXCLUDED.total_score,
      budget_adherence = EXCLUDED.budget_adherence,
      roi_score = EXCLUDED.roi_score,
      receivables_score = EXCLUDED.receivables_score;
  END IF;

  -- Audit trail samples
  INSERT INTO system_audit_logs (log_id, table_name, record_id, action, old_value, new_value, changed_by_user_id, changed_at)
  VALUES
    ('e0000026-0000-4000-8000-000000000001', 'fin_dept_budgets', v_budget_id, 'UPDATE', '{"utilized_amount":45000000}'::jsonb, '{"utilized_amount":47200000}'::jsonb, v_finance, NOW() - INTERVAL '2 hours'),
    ('e0000026-0000-4000-8000-000000000002', 'executive_documents', v_doc_land, 'INSERT', NULL, '{"title":"Main Campus Land Deed"}'::jsonb, v_chairman, NOW() - INTERVAL '1 day'),
    ('e0000026-0000-4000-8000-000000000003', 'executive_fee_waiver_requests', 'e0000013-0000-4000-8000-000000000001', 'INSERT', NULL, '{"status":"PENDING"}'::jsonb, v_hod, NOW() - INTERVAL '3 hours')
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Leadership executive smoke seed applied for tenant %', v_tenant;
END $$;

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'leadership.executive-smoke',
  'leadership',
  'chairman@mygyanvihar.com',
  'Executive Action & Control + Financial Oversight',
  'SMOKE-EXEC-2026',
  'Pending approvals, tasks, memos, vault, VIP, compliance, debt/FD, feed events. Login: chairman@mygyanvihar.com / password123'
)
ON CONFLICT (smoke_key) DO UPDATE SET
  notes = EXCLUDED.notes,
  seeded_at = NOW();

-- Refresh executive overview materialized view if present
DO $$
BEGIN
  IF to_regclass('public.exec_daily_university_health') IS NOT NULL THEN
    REFRESH MATERIALIZED VIEW exec_daily_university_health;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'exec_daily_university_health refresh skipped: %', SQLERRM;
END $$;

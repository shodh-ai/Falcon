-- Track 6.5: Executive BI smoke seed (Chairman manual test)
-- Login: chairman@mygyanvihar.com / password123

DO $$
DECLARE
  v_tenant UUID := 'a0000000-0000-4000-8000-000000000001';
  v_comp UUID;
  v_round_gt UUID;
  v_prog_id INT := 1;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE tenant_id = v_tenant) THEN
    RAISE NOTICE 'executive BI seed skipped — sgvu tenant missing';
    RETURN;
  END IF;

  INSERT INTO admissions_leads (lead_id, tenant_id, full_name, email, phone, stage, source, lead_score, created_at, updated_at)
  SELECT v.lead_id, v_tenant, v.full_name, v.email, v.phone, v.stage, v.source, v.lead_score, v.created_at, NOW()
  FROM (VALUES
    ('f0000001-0000-4000-8000-000000000001'::uuid, 'Arjun Mehta', 'arjun.mehta@example.com', '9876500001', 'INQUIRY', 'TOKAMAK_GOLDEN_TICKET', 95, NOW() - INTERVAL '2 days'),
    ('f0000001-0000-4000-8000-000000000002'::uuid, 'Sneha Reddy', 'sneha.reddy@example.com', '9876500002', 'OFFERED', 'TOKAMAK_GOLDEN_TICKET', 92, NOW() - INTERVAL '5 days'),
    ('f0000001-0000-4000-8000-000000000003'::uuid, 'Kabir Singh', 'kabir.singh@example.com', '9876500003', 'ENROLLED', 'TOKAMAK_GOLDEN_TICKET', 98, NOW() - INTERVAL '12 days'),
    ('f0000001-0000-4000-8000-000000000004'::uuid, 'Priya Nair', 'priya.nair@example.com', '9876500004', 'INQUIRY', 'Website', 45, NOW() - INTERVAL '1 day'),
    ('f0000001-0000-4000-8000-000000000005'::uuid, 'Rahul Verma', 'rahul.verma@example.com', '9876500005', 'CONTACTED', 'Referral', 55, NOW() - INTERVAL '3 days'),
    ('f0000001-0000-4000-8000-000000000006'::uuid, 'Ananya Iyer', 'ananya.iyer@example.com', '9876500006', 'APPLICATION_STARTED', 'Education Fair', 70, NOW() - INTERVAL '8 days'),
    ('f0000001-0000-4000-8000-000000000007'::uuid, 'Vikram Joshi', 'vikram.joshi@example.com', '9876500007', 'OFFERED', 'Organic', 85, NOW() - INTERVAL '15 days'),
    ('f0000001-0000-4000-8000-000000000008'::uuid, 'Meera Kapoor', 'meera.kapoor@example.com', '9876500008', 'ENROLLED', 'Advertisement', 90, NOW() - INTERVAL '20 days'),
    ('f0000001-0000-4000-8000-000000000009'::uuid, 'Dev Patel', 'dev.patel@example.com', '9876500009', 'ENROLLED', 'Website', 88, NOW() - INTERVAL '25 days'),
    ('f0000001-0000-4000-8000-00000000000a'::uuid, 'Isha Gupta', 'isha.gupta@example.com', '9876500010', 'INQUIRY', 'Social Media', 40, NOW() - INTERVAL '4 hours')
  ) AS v(lead_id, full_name, email, phone, stage, source, lead_score, created_at)
  WHERE NOT EXISTS (SELECT 1 FROM admissions_leads l WHERE l.lead_id = v.lead_id);

  INSERT INTO admissions_applications (application_id, lead_id, program_id, status, submitted_at, created_at, updated_at)
  SELECT v.application_id, v.lead_id, v_prog_id, v.status, v.submitted_at, v.created_at, NOW()
  FROM (VALUES
    ('f0000003-0000-4000-8000-000000000001'::uuid, 'f0000001-0000-4000-8000-000000000006'::uuid, 'SUBMITTED', NOW() - INTERVAL '7 days', NOW() - INTERVAL '8 days'),
    ('f0000003-0000-4000-8000-000000000002'::uuid, 'f0000001-0000-4000-8000-000000000002'::uuid, 'OFFERED', NOW() - INTERVAL '4 days', NOW() - INTERVAL '5 days'),
    ('f0000003-0000-4000-8000-000000000003'::uuid, 'f0000001-0000-4000-8000-000000000003'::uuid, 'ACCEPTED', NOW() - INTERVAL '11 days', NOW() - INTERVAL '12 days'),
    ('f0000003-0000-4000-8000-000000000004'::uuid, 'f0000001-0000-4000-8000-000000000007'::uuid, 'OFFERED', NOW() - INTERVAL '14 days', NOW() - INTERVAL '15 days'),
    ('f0000003-0000-4000-8000-000000000005'::uuid, 'f0000001-0000-4000-8000-000000000008'::uuid, 'ACCEPTED', NOW() - INTERVAL '19 days', NOW() - INTERVAL '20 days')
  ) AS v(application_id, lead_id, status, submitted_at, created_at)
  WHERE NOT EXISTS (SELECT 1 FROM admissions_applications a WHERE a.application_id = v.application_id);

  SELECT competition_id INTO v_comp FROM competitions WHERE tenant_id = v_tenant AND slug = 'sim-to-real-rodeo' LIMIT 1;
  IF v_comp IS NOT NULL THEN
    SELECT round_id INTO v_round_gt FROM competition_rounds WHERE competition_id = v_comp AND stage = 'GOLDEN_TICKET' LIMIT 1;
    INSERT INTO competition_entries (
      entry_id, competition_id, round_id, applicant_name, applicant_email,
      stage, status, golden_ticket_code, admissions_lead_id, created_at
    )
    SELECT v.entry_id, v_comp, v_round_gt, v.applicant_name, v.applicant_email, 'GOLDEN_TICKET', 'WINNER', v.ticket_code, v.lead_id, v.created_at
    FROM (VALUES
      ('f0000002-0000-4000-8000-000000000001'::uuid, 'Arjun Mehta', 'arjun.mehta@example.com', 'GT-A1B2C3D4', 'f0000001-0000-4000-8000-000000000001'::uuid, NOW() - INTERVAL '2 days'),
      ('f0000002-0000-4000-8000-000000000002'::uuid, 'Sneha Reddy', 'sneha.reddy@example.com', 'GT-E5F6G7H8', 'f0000001-0000-4000-8000-000000000002'::uuid, NOW() - INTERVAL '5 days'),
      ('f0000002-0000-4000-8000-000000000003'::uuid, 'Kabir Singh', 'kabir.singh@example.com', 'GT-I9J0K1L2', 'f0000001-0000-4000-8000-000000000003'::uuid, NOW() - INTERVAL '12 days')
    ) AS v(entry_id, applicant_name, applicant_email, ticket_code, lead_id, created_at)
    WHERE NOT EXISTS (SELECT 1 FROM competition_entries e WHERE e.entry_id = v.entry_id);
  END IF;

  INSERT INTO owner_daily_briefs (tenant_id, brief_date, bullets, sources)
  SELECT
    v_tenant,
    CURRENT_DATE,
    '[
      "Campus pulse: 3 Gladiator golden tickets active in admissions pipeline — prioritize conversion this week.",
      "Finance: ₹2.85L vendor invoice and ₹12.5L PO await Chairman sign-off in action inbox.",
      "Academics: Average enrollment attendance trending at 78% — 2 departments below mandate; review before NAAC window.",
      "Operations: 6 open ESM tickets from QR scans — estate team SLA watch recommended.",
      "Strategy: TCS MoU renewal in 20 days; align placement funnel with corporate partnership calendar."
    ]'::jsonb,
    '{"generated_for":"chairman","track":"6.5-executive-bi"}'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM owner_daily_briefs b WHERE b.tenant_id = v_tenant AND b.brief_date = CURRENT_DATE
  );

  UPDATE owner_daily_briefs
  SET bullets = '[
      "Campus pulse: 3 Gladiator golden tickets active in admissions pipeline — prioritize conversion this week.",
      "Finance: ₹2.85L vendor invoice and ₹12.5L PO await Chairman sign-off in action inbox.",
      "Academics: Average enrollment attendance trending at 78% — 2 departments below mandate; review before NAAC window.",
      "Operations: 6 open ESM tickets from QR scans — estate team SLA watch recommended.",
      "Strategy: TCS MoU renewal in 20 days; align placement funnel with corporate partnership calendar."
    ]'::jsonb,
    generated_at = NOW()
  WHERE tenant_id = v_tenant AND brief_date = CURRENT_DATE;

  INSERT INTO cash_flow_forecasts (tenant_id, horizon_days, forecast_date, projected_balance, assumptions)
  SELECT v_tenant, v.horizon, CURRENT_DATE, v.balance, v.assumptions::jsonb
  FROM (VALUES
    (30, 142000000::numeric, '{"note":"Q3 tuition collection + FD maturity"}'),
    (90, 158000000::numeric, '{"note":"Admissions intake + grant inflow"}'),
    (180, 171000000::numeric, '{"note":"Campus expansion drawdown offset by enrollment"}')
  ) AS v(horizon, balance, assumptions)
  WHERE NOT EXISTS (
    SELECT 1 FROM cash_flow_forecasts f
    WHERE f.tenant_id = v_tenant AND f.horizon_days = v.horizon AND f.forecast_date = CURRENT_DATE
  );

  RAISE NOTICE 'Executive BI seed applied for tenant %', v_tenant;
END $$;

DO $$
BEGIN
  IF to_regclass('public.exec_daily_university_health') IS NOT NULL THEN
    REFRESH MATERIALIZED VIEW exec_daily_university_health;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'exec_daily_university_health refresh skipped: %', SQLERRM;
END $$;

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
SELECT
  'leadership.executive-bi-track6',
  'leadership',
  'chairman@mygyanvihar.com',
  'Executive BI — overview, intelligence, action center, admissions funnel',
  'SMOKE-EXEC-BI-2026',
  'Admissions funnel + Gladiator golden tickets, owner brief, cash forecasts. Test 6.5.'
WHERE NOT EXISTS (SELECT 1 FROM smoke_seed_manifest WHERE smoke_key = 'leadership.executive-bi-track6');

UPDATE smoke_seed_manifest
SET notes = 'Admissions funnel + Gladiator golden tickets, owner brief, cash forecasts. Test 6.5.',
    seeded_at = NOW()
WHERE smoke_key = 'leadership.executive-bi-track6';

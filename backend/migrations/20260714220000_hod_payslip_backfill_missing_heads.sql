-- Backfill My Payslips & Tax for department heads missed by command-center parity
-- (Applied Sciences already had syllabus modules when parity ran, so payslip seed was skipped).

DO $$
DECLARE
  v_tenant UUID;
  hod RECORD;
  rec RECORD;
  v_slug TEXT;
BEGIN
  SELECT tenant_id INTO v_tenant FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF v_tenant IS NULL THEN RETURN; END IF;

  FOR hod IN
    SELECT d.dept_id, d.dept_name, d.hod_user_id, u.official_email
    FROM departments d
    JOIN users u ON u.user_id = d.hod_user_id
    WHERE d.hod_user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM staff_payslips sp
        WHERE sp.tenant_id = v_tenant
          AND sp.staff_user_id = d.hod_user_id
          AND sp.deleted_at IS NULL
          AND sp.is_published IS TRUE
      )
  LOOP
    v_slug := replace(split_part(hod.official_email, '@', 1), '.', '-');

    FOR rec IN
      SELECT * FROM (VALUES
        ('April',  2026, 95000.00,  82000.00, 22, 0.00),
        ('May',    2026, 95000.00,  80500.00, 21, 1.00),
        ('June',   2026, 95000.00,  88000.00, 22, 0.00)
      ) AS d(month, year, gross_pay, net_pay, working_days, lwp_days)
    LOOP
      INSERT INTO staff_payslips (
        tenant_id, staff_user_id, month, year,
        gross_pay, net_pay, working_days, lwp_days,
        file_path, is_published, published_at, generated_at
      )
      SELECT
        v_tenant, hod.hod_user_id, rec.month, rec.year,
        rec.gross_pay, rec.net_pay, rec.working_days, rec.lwp_days,
        '/uploads/payslips/smoke-' || v_slug || '-' || lower(rec.month) || '-' || rec.year || '.pdf',
        TRUE, NOW(), NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM staff_payslips sp
        WHERE sp.tenant_id = v_tenant
          AND sp.staff_user_id = hod.hod_user_id
          AND sp.month = rec.month
          AND sp.year = rec.year
          AND sp.deleted_at IS NULL
      );
    END LOOP;

    RAISE NOTICE 'Backfilled payslips for % HOD (%)', hod.dept_name, hod.official_email;
  END LOOP;
END $$;

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'hod.payslip-backfill-missing-heads',
  'hod',
  'gaurav.sharma@mygyanvihar.com',
  'my_payslips_tax',
  'Apr–Jun 2026 published payslips + request/download flow on My Payslips & Tax',
  'Backfills dept heads skipped when command-center parity seed ran after syllabus data existed'
)
ON CONFLICT (smoke_key) DO UPDATE SET
  sample_record = EXCLUDED.sample_record,
  notes = EXCLUDED.notes,
  seeded_at = NOW();

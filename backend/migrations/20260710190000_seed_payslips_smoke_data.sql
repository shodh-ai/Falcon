-- Smoke payslips for My Payslips & Tax (hod@, faculty1@, pharmacy HOD, dean@, sohit@, ellwil@)

DO $$
DECLARE
  v_tenant UUID;
  v_user UUID;
  v_email TEXT;
  v_slug TEXT;
  rec RECORD;
BEGIN
  SELECT tenant_id INTO v_tenant FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF v_tenant IS NULL THEN RETURN; END IF;

  FOR v_email IN
    SELECT unnest(ARRAY[
      'hod@mygyanvihar.com',
      'faculty1@mygyanvihar.com',
      'hitesh.kumar@mygyanvihar.com',
      'dean@mygyanvihar.com',
      'sohit@mygyanvihar.com',
      'ellwil@mygyanvihar.com'
    ])
  LOOP
    SELECT user_id INTO v_user
    FROM users
    WHERE tenant_id = v_tenant AND lower(official_email) = lower(v_email)
    LIMIT 1;

    IF v_user IS NULL THEN CONTINUE; END IF;

    v_slug := replace(split_part(v_email, '@', 1), '.', '-');

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
        v_tenant, v_user, rec.month, rec.year,
        rec.gross_pay, rec.net_pay, rec.working_days, rec.lwp_days,
        '/uploads/payslips/smoke-' || v_slug || '-' || lower(rec.month) || '-' || rec.year || '.pdf',
        TRUE, NOW(), NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM staff_payslips sp
        WHERE sp.tenant_id = v_tenant
          AND sp.staff_user_id = v_user
          AND sp.month = rec.month
          AND sp.year = rec.year
          AND sp.deleted_at IS NULL
      );
    END LOOP;

    -- Ensure legacy ellwil rows (March etc.) are published too
    UPDATE staff_payslips
    SET is_published = TRUE,
        published_at = COALESCE(published_at, NOW()),
        gross_pay = COALESCE(gross_pay, net_pay)
    WHERE tenant_id = v_tenant
      AND staff_user_id = v_user
      AND deleted_at IS NULL
      AND is_published IS NOT TRUE;
  END LOOP;
END $$;

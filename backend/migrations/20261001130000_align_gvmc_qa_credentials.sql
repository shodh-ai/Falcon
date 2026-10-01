-- Align the dedicated GVMC production-QA accounts with the credential pack
-- issued on 2026-09-30.  Plaintext passwords are intentionally not stored.
-- This migration is limited to the GVMC tenant and the exact eleven QA users.
DO $$
DECLARE
  v_tenant_id UUID;
  v_updated INTEGER;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM tenants
  WHERE lower(subdomain) = 'gvmc'
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE users AS u
  SET password_hash = credentials.password_hash,
      onboarding_status = 'COMPLETED',
      is_active = true,
      deleted_at = NULL,
      updated_at = NOW()
  FROM (
    VALUES
      ('requester.gvmc@mygyanvihar.com', '$2b$12$NXDyERDtx6PM4XoiUvrvYeiNGMxc5JhLRQq3Xvu.qd2xfWxNGCJq.'),
      ('hod.gvmc@mygyanvihar.com', '$2b$12$j6d6kaOFrsRlSAQ2cl0R5ulnJIpliqamLRpcwmUDZsG46O77BMoZm'),
      ('college-approver.gvmc@mygyanvihar.com', '$2b$12$lJXOZQvUP24P1Tmbae6nyOZTzinl1fOJeUr.teNDfybuePHIJk5ti'),
      ('procurement-operator.gvmc@mygyanvihar.com', '$2b$12$w5kFM/.A1/XtbuALk/U0meahJYrEPzFL.lH0biIWvJ6Kg80izom4i'),
      ('procurement-review.gvmc@mygyanvihar.com', '$2b$12$8fH3DzL0VBlAchIMvHYh6.7AJbB38V..bMR2777wZoFA5t.wXb4qy'),
      ('budget-integrity.gvmc@mygyanvihar.com', '$2b$12$eDosCoTeNQmaEgZS7xrLRuLCxJVrI5B50XW1aKSmWUsh2oxG6VAsK'),
      ('payment.gvmc@mygyanvihar.com', '$2b$12$oqAiHlVMDQaE9W0YCy2IV.LWswCQpmEyyyfG54fXBJzfQtZGfvqHG'),
      ('receiving-stores.gvmc@mygyanvihar.com', '$2b$12$C5ozSoY7hqMOd.GpgU2b5.ZOA1KpQAOlN6mcJxGkYc1/rZXwKuY4.'),
      ('inventory-verifier.gvmc@mygyanvihar.com', '$2b$12$Noe53OlkNKaFSN2L5EQlQOoeCGIXkFqDfA6dVIIBx7VCjCS7ozUZ2'),
      ('auditor.gvmc@mygyanvihar.com', '$2b$12$2hTWwGYkoTirlkrfZEF3Eu8fdVD3tMyNrzRlEeiYUXZkdxTaFwzky'),
      ('tenant-admin.gvmc@mygyanvihar.com', '$2b$12$81LrPFv0ISBD39JVwgAkle9Q1nULpKHs8oDNUY/ozcxvN/qOnuWt.')
  ) AS credentials(email, password_hash)
  WHERE u.tenant_id = v_tenant_id
    AND lower(u.official_email) = credentials.email;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 11 THEN
    RAISE EXCEPTION
      'GVMC QA credential alignment expected 11 accounts but updated %',
      v_updated;
  END IF;
END $$;

-- Rotate only the dedicated GVMC production-QA accounts after an explicit
-- operator request. Plaintext credentials are intentionally not stored here.
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
      ('requester.gvmc@mygyanvihar.com', '$2b$12$.E7d05/63wb.Lz7LG4rYXusFTjGQ7sdZd9ta10Jx4wz/Jx9VZKsW6'),
      ('hod.gvmc@mygyanvihar.com', '$2b$12$hoRJmgkINgF3fKvmtR2sX.JEEgCwjeXLNgvtmv3wxlspeqifbbjOi'),
      ('college-approver.gvmc@mygyanvihar.com', '$2b$12$GbIz8Tg34GdzKB0Zltk9BeG.yZw1cDXIpfy8N1HuryPEUHHKyPJrS'),
      ('procurement-operator.gvmc@mygyanvihar.com', '$2b$12$gg97kLxRO8OuS3MgnRv/qOkw/f1P4LJRc59mWtYm3Us2scjQ2t40K'),
      ('procurement-review.gvmc@mygyanvihar.com', '$2b$12$xgl5K10hO06lb6YDCiVgneo0d3a40Z295nA6ya//uKB9v7KspJi2e'),
      ('budget-integrity.gvmc@mygyanvihar.com', '$2b$12$Dc9suSTzlqLk3s0jJtJbqusXU5z7MDqeu3K9aataCC09LQbaGmGRC'),
      ('payment.gvmc@mygyanvihar.com', '$2b$12$fxAcZK.x5nnSE2qiz5CKW..MrOfbIstGXR9Vrkc0J1/hk5FUj43V6'),
      ('receiving-stores.gvmc@mygyanvihar.com', '$2b$12$BsjClOsh56r3oIBFEHuI1uleTWj1fK5WcmDDi/c1pHt7qPR8IJiJ.'),
      ('inventory-verifier.gvmc@mygyanvihar.com', '$2b$12$t4ql1WFoLGJtp5GUoVe50O3LP.oTWdZTxj.D5j9t5gwLaKNB5.ZN6'),
      ('auditor.gvmc@mygyanvihar.com', '$2b$12$mVVuBA8r2zEf.wXeMmPRQ.Wmb6c4r3U0k3yk.1GM3EKABdTRxyQXq'),
      ('tenant-admin.gvmc@mygyanvihar.com', '$2b$12$n9848LxYI3kBd91V.m8tlObhNjQbcvea3vqD6ZGuB4RnwzMotP6Ne')
  ) AS credentials(email, password_hash)
  WHERE u.tenant_id = v_tenant_id
    AND lower(u.official_email) = credentials.email;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 11 THEN
    RAISE EXCEPTION
      'GVMC QA credential rotation expected 11 accounts but updated %',
      v_updated;
  END IF;
END $$;

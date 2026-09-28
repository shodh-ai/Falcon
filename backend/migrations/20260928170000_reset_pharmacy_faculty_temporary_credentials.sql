-- Reissue the approved launch credentials for the complete Pharmacy faculty
-- cohort. Only bcrypt hashes are stored in source control; plaintext temporary
-- passwords remain in the restricted handoff package outside the repository.

BEGIN;

CREATE TEMP TABLE pharmacy_faculty_credential_reset (
  official_email VARCHAR(255) PRIMARY KEY,
  password_hash VARCHAR(255) NOT NULL
) ON COMMIT DROP;

INSERT INTO pharmacy_faculty_credential_reset (official_email, password_hash)
VALUES
  ('preeti.khulbe@mygyanvihar.com', '$2b$12$JrOEEN14pWYL23PZaWUCn.86jFjloI1aGZkvX9bRF4xFt4IH26NBO'),
  ('vivek.gupta@mygyanvihar.com', '$2b$12$zv6WwH5jmYL6qzSJUVjrW.xLDcNOQCdHuui6H.k.4lpAf6bRaOHQu'),
  ('nidhi.chauhan@mygyanvihar.com', '$2b$12$EP9xLVUjtRvHGOkkL5NN.e0OArWIzR0uO8hSa12eEM1XcQqIb7O72'),
  ('mahendra.saini@mygyanvihar.com', '$2b$12$RurkPCL/Wt38dudKQHu1aeR.EZJfDGZJiRkz058yQhp3iMzchVi1O'),
  ('priya.sen@mygyanvihar.com', '$2b$12$rPb7tmOrHydhA0iz4MpXYeLi3PlsByFcbUgxish4035AYR7TqJ3ee'),
  ('manish.gupta@mygyanvihar.com', '$2b$12$k169Q.iBGBcgnNaKDZS1.edxKhte6NiBWoPStD2lQqzlwmAYaDPIS'),
  ('neeraj.patel@mygyanvihar.com', '$2b$12$Im.xifvYgga554677I9lZ.AtQLXzS.rbtmUxAomyMcm5IR2odVd1C'),
  ('aishwarya.rathore@mygyanvihar.com', '$2b$12$0NySGNSBr1GFPnSuZOo3TOF3OxWF6zSoUH4KVeKeX5qrgzaMDrkHq'),
  ('yogesh.matta@mygyanvihar.com', '$2b$12$rRPf7HQ7WtZaDZi0UwebmeL9rJm3RT3E3I0QhdMGcQqXeG7y2Qw1i'),
  ('neha.arora@mygyanvihar.com', '$2b$12$6o99lkb18O2AL6rL2dkEpurfZDkXoEyIbjM10nQu7n9n9wv9zRmFW'),
  ('tapasvi.gupta@mygyanvihar.com', '$2b$12$joD6NGSNPAvZFwaOSr7hhusI6GbpMiJ1gnrNdMmpRBVPielHX/UA6'),
  ('shalu.jain@mygyanvihar.com', '$2b$12$KGovp7EgXDfQOrb0NJ1s3.p0OpkVO1gBWi0VsCxfZhb5gPpF6U.Tq'),
  ('prashantkr.dhakad@mygyanvihar.com', '$2b$12$E/jQFI8coOt1m3yYAYPtTe/mqX/ipU4qWzW7ijk5SAo/ria.i8SW6'),
  ('muskan.jain@mygyanvihar.com', '$2b$12$65aqd0eLHPV4fi525JlVR.8Q5FYSpnAOP0u8lt42Kax8xHU42H3aG'),
  ('animesh.kumar@mygyanvihar.com', '$2b$12$nw34jdZh6p.9Y/WIF1FaOelLVvGozmbCKjedbPwAps2CSMe2Gfmxe'),
  ('hitesh.kumar@mygyanvihar.com', '$2b$12$zVoyobgEOJDPIRV92fZ7yuxtqq0hUCdN4SfFpxi5wBF9ySpQrSdg.'),
  ('nisha.yadav@mygyanvihar.com', '$2b$12$8xe8jU.FQCB50FCKvm7RG.043ZWMffds7JOyfpps4wFGfKs4MRFE2'),
  ('arjun.kaushik@mygyanvihar.com', '$2b$12$pFldBe1mrtEqbMdNUydFtOcmP/yekfiBmALGSttzZfqj79YpSICXK'),
  ('sandeep.kumar@mygyanvihar.com', '$2b$12$vdkYPGrJrxvpDb4XyQw39uW6kxhzz2XjrSzrBqLO45QqGilCtKYD6'),
  ('charu.misra@mygyanvihar.com', '$2b$12$CVW9.vjo9Kcr.x.PH3sfou0ZsJRamQ0K/cWyqq0J7//j0gfBp6Uoi'),
  ('samarpan.mishra@mygyanvihar.com', '$2b$12$9uKAP5XJAXXwgGJZXneLwu2dvwp1lRs9mZDsxcPUzMEKNnhUMDTce'),
  ('supriya.sarkar@mygyanvihar.com', '$2b$12$c3IetSFzBVinx/f2qtQ4YentvwfmNkRo6ouep9.rxFi.rIR8rDaYS'),
  ('manish1.gupta@mygyanvihar.com', '$2b$12$tUQb83qNLfI0dEXRI4/IT.Oaylk4UuZqk2H5xoR1XbSkeF0mdh1du'),
  ('amit.kaushik@mygyanvihar.com', '$2b$12$KVYKwOR.SHMVhdC0L.ErCudz5mzzfBLL2yGa3SdUrDnBjFv/.Ti86'),
  ('abha.mishra@mygyanvihar.com', '$2b$12$/wKEyqZTI9R3aGp8dWPRMOTqEA1e2MLwFn1mh9M5JA8SeRelvAvc6'),
  ('alisha.singh@mygyanvihar.com', '$2b$12$/JxuSfaWuMkXHdgZS0kId.rjP2z4xE0gmLmlDMYRnWs8vS3rtYjIy'),
  ('shikha.kandpal@mygyanvihar.com', '$2b$12$tf/BHNLMnuE9rTG1vWwPYuT0RQyHL4aNl2aE8qZi1DlL9axIplU1i'),
  ('gauri.gupta@mygyanvihar.com', '$2b$12$C8Knsqiqs4Qw6bYj7EGJieUrjZZuUsJAKO4CD1a1tqxhaM6VImn3u');

DO $$
DECLARE
  resolved_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO resolved_count
  FROM pharmacy_faculty_credential_reset r
  JOIN public.tenants t ON t.subdomain = 'sgvu' AND t.is_active = true
  JOIN users u
    ON u.tenant_id = t.tenant_id
   AND lower(u.official_email) = lower(r.official_email)
   AND u.deleted_at IS NULL;

  IF resolved_count <> 28 THEN
    RAISE EXCEPTION 'Expected 28 active SGVU Pharmacy faculty accounts, found %', resolved_count;
  END IF;
END $$;

INSERT INTO system_audit_logs (
  table_name, record_id, action, old_value, new_value, changed_by_user_id
)
SELECT
  'users',
  u.user_id,
  'UPDATE',
  jsonb_build_object(
    'onboarding_status', u.onboarding_status,
    'account_status', u.account_status,
    'password_credential_reissued', false
  ),
  jsonb_build_object(
    'onboarding_status', 'PENDING_PASSWORD_RESET',
    'account_status', 'ACTIVE',
    'password_credential_reissued', true,
    'reason', 'Authorized Pharmacy launch credential handoff',
    'migration', '20260928170000_reset_pharmacy_faculty_temporary_credentials.sql'
  ),
  u.user_id
FROM pharmacy_faculty_credential_reset r
JOIN public.tenants t ON t.subdomain = 'sgvu' AND t.is_active = true
JOIN users u
  ON u.tenant_id = t.tenant_id
 AND lower(u.official_email) = lower(r.official_email)
 AND u.deleted_at IS NULL;

UPDATE users u
SET
  password_hash = r.password_hash,
  onboarding_status = 'PENDING_PASSWORD_RESET',
  onboarding_profile = '{}'::jsonb,
  account_status = 'ACTIVE',
  is_active = true,
  updated_at = NOW()
FROM pharmacy_faculty_credential_reset r
JOIN public.tenants t ON t.subdomain = 'sgvu' AND t.is_active = true
WHERE u.tenant_id = t.tenant_id
  AND lower(u.official_email) = lower(r.official_email)
  AND u.deleted_at IS NULL;

DO $$
DECLARE
  verified_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO verified_count
  FROM pharmacy_faculty_credential_reset r
  JOIN public.tenants t ON t.subdomain = 'sgvu' AND t.is_active = true
  JOIN users u
    ON u.tenant_id = t.tenant_id
   AND lower(u.official_email) = lower(r.official_email)
  WHERE u.password_hash = r.password_hash
    AND u.onboarding_status = 'PENDING_PASSWORD_RESET'
    AND u.account_status = 'ACTIVE'
    AND u.is_active = true
    AND u.deleted_at IS NULL;

  IF verified_count <> 28 THEN
    RAISE EXCEPTION 'Expected 28 reissued Pharmacy faculty credentials, found %', verified_count;
  END IF;
END $$;

COMMIT;

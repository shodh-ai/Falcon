-- Correct the 20260928170000 Pharmacy credential reissue regression.
--
-- The original migration reset every account and erased onboarding_profile,
-- including faculty who had already submitted for verification. Private
-- profile values cannot be recreated from documents, so affected in-progress
-- users are returned to PENDING_DOCUMENTS for an explicit, safe resubmission.
-- Uploaded documents are preserved. Accounts that progressed again after the
-- incident are not moved backwards.

BEGIN;

CREATE TEMP TABLE pharmacy_onboarding_recovery
ON COMMIT DROP AS
SELECT DISTINCT ON (a.record_id)
  a.record_id AS user_id,
  a.old_value->>'onboarding_status' AS prior_status
FROM system_audit_logs a
WHERE a.new_value->>'migration' =
  '20260928170000_reset_pharmacy_faculty_temporary_credentials.sql'
ORDER BY a.record_id, a.changed_at DESC;

INSERT INTO system_audit_logs (
  table_name, record_id, action, old_value, new_value, changed_by_user_id
)
SELECT
  'users',
  u.user_id,
  'UPDATE',
  jsonb_build_object(
    'onboarding_status', u.onboarding_status,
    'profile_reentry_required', false
  ),
  jsonb_build_object(
    'onboarding_status', 'PENDING_DOCUMENTS',
    'profile_reentry_required', true,
    'prior_status', recovery.prior_status,
    'reason', 'Recovery from Pharmacy credential reset regression',
    'migration', '20260928190000_recover_pharmacy_onboarding_after_credential_reset.sql'
  ),
  u.user_id
FROM pharmacy_onboarding_recovery recovery
JOIN users u ON u.user_id = recovery.user_id
WHERE recovery.prior_status IN ('PENDING_DOCUMENTS', 'PENDING_ADMIN_APPROVAL')
  AND u.onboarding_status = 'PENDING_PASSWORD_RESET';

UPDATE users u
SET onboarding_status = 'PENDING_DOCUMENTS',
    onboarding_profile = jsonb_build_object(
      '_profile_reentry_required', true,
      '_profile_reentry_reason', 'credential_reset_recovery'
    ),
    updated_at = NOW()
FROM pharmacy_onboarding_recovery recovery
WHERE u.user_id = recovery.user_id
  AND recovery.prior_status IN ('PENDING_DOCUMENTS', 'PENDING_ADMIN_APPROVAL')
  AND u.onboarding_status = 'PENDING_PASSWORD_RESET';

COMMIT;

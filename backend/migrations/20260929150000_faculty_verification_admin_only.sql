-- Route faculty onboarding verification exclusively to Campus Admin and Super Admin.
-- Riya's temporary Pharmacy account must complete the same verification flow
-- as every other faculty account.

BEGIN;

UPDATE users u
SET onboarding_status = 'PENDING_DOCUMENTS',
    onboarding_profile = '{}'::jsonb,
    updated_at = NOW()
FROM public.tenants t
WHERE u.tenant_id = t.tenant_id
  AND t.subdomain = 'sgvu'
  AND lower(u.official_email) = 'riya.pharmacy@mygyanvihar.com'
  AND u.deleted_at IS NULL;

-- Retire staff-verification notifications previously routed to HOD or HR
-- workspaces. Admin queue synchronization recreates the correct notifications.
UPDATE falcon_notifications n
SET deleted_at = NOW()
WHERE n.deleted_at IS NULL
  AND n.title LIKE 'Verification request —%'
  AND n.action_link IN ('/hod/faculty-verifications', '/hr/verifications')
  AND EXISTS (
    SELECT 1
    FROM users target
    JOIN roles target_role ON target_role.role_id = target.role_id
    WHERE target.tenant_id = n.tenant_id
      AND target.user_id::text = n.metadata->>'targetUserId'
      AND lower(target_role.role_name) IN ('faculty', 'hod', 'dean')
  );

COMMIT;

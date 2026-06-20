-- Recover users stuck after a partial admin approve (status COMPLETED but onboarding docs still PENDING).

UPDATE users u
SET onboarding_status = 'PENDING_ADMIN_APPROVAL', updated_at = NOW()
WHERE u.onboarding_status = 'COMPLETED'
  AND (
    EXISTS (
      SELECT 1
      FROM staff_onboarding_docs d
      WHERE d.staff_user_id = u.user_id
        AND d.tenant_id = u.tenant_id
        AND d.status = 'PENDING'
    )
    OR EXISTS (
      SELECT 1
      FROM student_onboarding_docs d
      WHERE d.student_user_id = u.user_id
        AND d.tenant_id = u.tenant_id
        AND d.status = 'PENDING'
    )
  );

-- Preparation is per verified registration, never per batch-label guess.
-- Existing unlinked approvals and their legacy uniqueness rule are preserved.
-- Apply transactionally after the issued-document links migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM hall_ticket_approvals WHERE registration_id IS NOT NULL
    GROUP BY tenant_id, registration_id HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'Duplicate linked hall-ticket approvals require manual review before registration uniqueness';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hall_approval_registration
  ON hall_ticket_approvals(tenant_id, registration_id)
  WHERE registration_id IS NOT NULL;

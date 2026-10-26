-- A cancelled cover remains in the ledger for audit, but no longer blocks a
-- dated class swap or grants the substitute attendance access.
ALTER TABLE academic_proxy_requests
  DROP CONSTRAINT IF EXISTS academic_proxy_requests_status_check;
ALTER TABLE academic_proxy_requests
  ADD CONSTRAINT academic_proxy_requests_status_check
  CHECK (status IN ('PENDING_SUBSTITUTE_ACCEPTANCE', 'PENDING_HOD_APPROVAL',
                   'APPROVED', 'REJECTED', 'CANCELLED'));

-- Fix helpdesk ticket status constraint to allow REJECTED.
-- Earlier migration (20260614150000) dropped helpdesk_tickets_status_check but the live
-- constraint name is chk_helpdesk_tickets_status from schema alignment.

ALTER TABLE helpdesk_tickets
  DROP CONSTRAINT IF EXISTS chk_helpdesk_tickets_status;

ALTER TABLE helpdesk_tickets
  DROP CONSTRAINT IF EXISTS helpdesk_tickets_status_check;

ALTER TABLE helpdesk_tickets
  ADD CONSTRAINT chk_helpdesk_tickets_status
  CHECK (status IN ('PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'));

ALTER TABLE helpdesk_tickets
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL;

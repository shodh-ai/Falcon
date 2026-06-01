-- Align helpdesk_tickets schema with application entity expectations

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='helpdesk_tickets' AND column_name='helpdesk_ticket_id'
  ) THEN
    ALTER TABLE helpdesk_tickets RENAME COLUMN helpdesk_ticket_id TO ticket_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='helpdesk_tickets' AND column_name='created_by'
  ) THEN
    ALTER TABLE helpdesk_tickets RENAME COLUMN created_by TO student_user_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='helpdesk_tickets' AND column_name='assigned_to'
  ) THEN
    ALTER TABLE helpdesk_tickets RENAME COLUMN assigned_to TO assigned_to_user_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='helpdesk_tickets' AND column_name='conversation'
  ) THEN
    ALTER TABLE helpdesk_tickets ADD COLUMN conversation jsonb NULL;
  END IF;
END $$;

ALTER TABLE helpdesk_tickets
  ALTER COLUMN category TYPE varchar(20);

ALTER TABLE helpdesk_tickets
  ALTER COLUMN subject TYPE varchar(200);

-- Normalize status vocabulary + default
UPDATE helpdesk_tickets
SET status = CASE
  WHEN UPPER(status) IN ('OPEN', 'NEW') THEN 'PENDING'
  WHEN UPPER(status) IN ('IN_PROGRESS', 'INPROGRESS') THEN 'IN_PROGRESS'
  WHEN UPPER(status) IN ('RESOLVED', 'CLOSED', 'DONE') THEN 'RESOLVED'
  ELSE status
END;

ALTER TABLE helpdesk_tickets
  ALTER COLUMN status SET DEFAULT 'PENDING';

-- Ensure constraints exist (drop any old ones if names collide)
ALTER TABLE helpdesk_tickets
  DROP CONSTRAINT IF EXISTS chk_helpdesk_tickets_category;
ALTER TABLE helpdesk_tickets
  ADD CONSTRAINT chk_helpdesk_tickets_category CHECK (category IN ('FINANCE', 'ACADEMICS', 'IT', 'HOSTEL'));

ALTER TABLE helpdesk_tickets
  DROP CONSTRAINT IF EXISTS chk_helpdesk_tickets_status;
ALTER TABLE helpdesk_tickets
  ADD CONSTRAINT chk_helpdesk_tickets_status CHECK (status IN ('PENDING', 'IN_PROGRESS', 'RESOLVED'));

-- Add missing indexes used by the app
CREATE INDEX IF NOT EXISTS idx_helpdesk_tickets_student ON helpdesk_tickets (student_user_id);
CREATE INDEX IF NOT EXISTS idx_helpdesk_tickets_assigned_to ON helpdesk_tickets (assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_helpdesk_tickets_category_status ON helpdesk_tickets (category, status);

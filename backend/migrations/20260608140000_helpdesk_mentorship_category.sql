-- Allow MENTORSHIP tickets from the student mentorship portal (idempotent).

-- Drop every category CHECK on helpdesk_tickets (inline + named) so existing MENTORSHIP rows do not block the rewrite.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.helpdesk_tickets'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%category%'
  LOOP
    EXECUTE format('ALTER TABLE helpdesk_tickets DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

-- Normalize any legacy / unknown categories before re-adding the constraint.
UPDATE helpdesk_tickets
SET category = UPPER(TRIM(category))
WHERE category IS NOT NULL;

UPDATE helpdesk_tickets
SET category = 'ACADEMICS'
WHERE category NOT IN ('FINANCE', 'ACADEMICS', 'IT', 'HOSTEL', 'MENTORSHIP');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.helpdesk_tickets'::regclass
      AND conname = 'chk_helpdesk_tickets_category'
      AND pg_get_constraintdef(oid) ILIKE '%MENTORSHIP%'
  ) THEN
    ALTER TABLE helpdesk_tickets
      ADD CONSTRAINT chk_helpdesk_tickets_category
      CHECK (category IN ('FINANCE', 'ACADEMICS', 'IT', 'HOSTEL', 'MENTORSHIP'));
  END IF;
END $$;

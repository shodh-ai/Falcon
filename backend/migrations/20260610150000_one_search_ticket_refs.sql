-- Human-readable ticket references for One-Search (TKT-0001 format)

ALTER TABLE helpdesk_tickets ADD COLUMN IF NOT EXISTS ticket_ref VARCHAR(20);

-- Drop first so backfill updates cannot violate a partial unique index from a prior run
DROP INDEX IF EXISTS idx_helpdesk_ticket_ref;

WITH numbered AS (
  SELECT ticket_id, ROW_NUMBER() OVER (ORDER BY created_at ASC)::int AS rn
  FROM helpdesk_tickets
  WHERE ticket_ref IS NULL
)
UPDATE helpdesk_tickets t
SET ticket_ref = 'TKT-' || LPAD(n.rn::text, 4, '0')
FROM numbered n
WHERE t.ticket_id = n.ticket_id;

-- Resolve duplicate refs before creating the unique index (partial prior runs)
UPDATE helpdesk_tickets t
SET ticket_ref = t.ticket_ref || '-' || LEFT(t.ticket_id::text, 8)
FROM (
  SELECT ticket_id
  FROM (
    SELECT ticket_id, ROW_NUMBER() OVER (PARTITION BY ticket_ref ORDER BY ticket_id) AS rn
    FROM helpdesk_tickets
    WHERE ticket_ref IS NOT NULL
  ) d
  WHERE d.rn > 1
) dup
WHERE t.ticket_id = dup.ticket_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_helpdesk_ticket_ref ON helpdesk_tickets(ticket_ref) WHERE ticket_ref IS NOT NULL;

WITH ranked AS (
  SELECT user_id, ROW_NUMBER() OVER (ORDER BY user_id) AS rn
  FROM student_profiles
  WHERE enrollment_no IS NULL OR enrollment_no = ''
)
UPDATE student_profiles sp
SET enrollment_no = 'SGVU-2026-' || LPAD(r.rn::text, 3, '0')
FROM ranked r
WHERE sp.user_id = r.user_id;

UPDATE hr_employee_profiles ep
SET employee_id = 'EMP-' || (400 + sub.rn)::text
FROM (
  SELECT profile_id, ROW_NUMBER() OVER (ORDER BY user_id) AS rn
  FROM hr_employee_profiles
  WHERE employee_id IS NULL OR employee_id = ''
) sub
WHERE ep.profile_id = sub.profile_id;

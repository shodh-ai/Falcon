-- Confirmed policy: one officially issued ticket per tenant/student/session.
-- Requires 20261023120000_hall_ticket_issued_document_links.sql.
-- Run transactionally. Never relink legacy rows or remove duplicate records.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM exam_admit_card_entries
    WHERE issued_at IS NOT NULL
    GROUP BY tenant_id, student_user_id, session_id HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'Duplicate officially issued hall tickets require manual review before applying session uniqueness';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hall_issued_student_session
  ON exam_admit_card_entries(tenant_id, student_user_id, session_id)
  WHERE issued_at IS NOT NULL;

-- Legacy schedules stay unlinked, never guessed from batch or semester labels.
ALTER TABLE exam_schedules ADD COLUMN IF NOT EXISTS session_id UUID;
CREATE INDEX IF NOT EXISTS idx_hall_schedule_session
  ON exam_schedules(tenant_id, session_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='exam_schedules'::regclass AND conname='fk_hall_schedule_session') THEN
    ALTER TABLE exam_schedules ADD CONSTRAINT fk_hall_schedule_session
      FOREIGN KEY(session_id, tenant_id)
      REFERENCES exam_sessions(session_id, tenant_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='exam_schedules'::regclass AND conname='ck_hall_schedule_session_tenant') THEN
    ALTER TABLE exam_schedules ADD CONSTRAINT ck_hall_schedule_session_tenant
      CHECK (session_id IS NULL OR tenant_id IS NOT NULL);
  END IF;
END $$;

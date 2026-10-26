-- Add provenance for issued hall tickets. Never infer or backfill legacy links.
-- This does NOT decide the ticket business key or change the legacy approval
-- uniqueness rule. Those policy decisions must precede enabling new issuance.
-- Parent indexes include their primary key: they cannot exclude valid records.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hall_session_tenant
  ON exam_sessions(session_id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hall_registration_scope
  ON exam_semester_registrations(registration_id, tenant_id, student_user_id, session_id, semester);

ALTER TABLE hall_ticket_approvals
  ADD COLUMN IF NOT EXISTS registration_id UUID,
  ADD COLUMN IF NOT EXISTS session_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uq_hall_approval_scope
  ON hall_ticket_approvals(approval_id, tenant_id, student_user_id, session_id);

ALTER TABLE exam_admit_card_runs ADD COLUMN IF NOT EXISTS session_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uq_hall_run_scope
  ON exam_admit_card_runs(run_id, tenant_id, session_id);

ALTER TABLE exam_admit_card_entries
  ADD COLUMN IF NOT EXISTS tenant_id UUID,
  ADD COLUMN IF NOT EXISTS session_id UUID,
  ADD COLUMN IF NOT EXISTS approval_id UUID,
  ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS issuance_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS document_sha256 VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_hall_issued_student
  ON exam_admit_card_entries(tenant_id, student_user_id, session_id)
  WHERE issued_at IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='hall_ticket_approvals'::regclass AND conname='fk_hall_approval_registration') THEN
    ALTER TABLE hall_ticket_approvals ADD CONSTRAINT fk_hall_approval_registration
      FOREIGN KEY(registration_id, tenant_id, student_user_id, session_id, semester)
      REFERENCES exam_semester_registrations(registration_id, tenant_id, student_user_id, session_id, semester);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='hall_ticket_approvals'::regclass AND conname='ck_hall_approval_links') THEN
    ALTER TABLE hall_ticket_approvals ADD CONSTRAINT ck_hall_approval_links
      CHECK ((registration_id IS NULL AND session_id IS NULL)
          OR (registration_id IS NOT NULL AND session_id IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='exam_admit_card_runs'::regclass AND conname='fk_hall_run_session') THEN
    ALTER TABLE exam_admit_card_runs ADD CONSTRAINT fk_hall_run_session
      FOREIGN KEY(session_id, tenant_id) REFERENCES exam_sessions(session_id, tenant_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='exam_admit_card_entries'::regclass AND conname='fk_hall_entry_approval') THEN
    ALTER TABLE exam_admit_card_entries ADD CONSTRAINT fk_hall_entry_approval
      FOREIGN KEY(approval_id, tenant_id, student_user_id, session_id)
      REFERENCES hall_ticket_approvals(approval_id, tenant_id, student_user_id, session_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='exam_admit_card_entries'::regclass AND conname='fk_hall_entry_run') THEN
    ALTER TABLE exam_admit_card_entries ADD CONSTRAINT fk_hall_entry_run
      FOREIGN KEY(run_id, tenant_id, session_id)
      REFERENCES exam_admit_card_runs(run_id, tenant_id, session_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='exam_admit_card_entries'::regclass AND conname='ck_hall_entry_issued_metadata') THEN
    ALTER TABLE exam_admit_card_entries ADD CONSTRAINT ck_hall_entry_issued_metadata CHECK (
      (issued_at IS NULL AND tenant_id IS NULL AND session_id IS NULL
       AND approval_id IS NULL AND issuance_snapshot IS NULL AND document_sha256 IS NULL)
      OR
      (issued_at IS NOT NULL AND tenant_id IS NOT NULL AND session_id IS NOT NULL
       AND approval_id IS NOT NULL AND eligible = true AND pdf_path IS NOT NULL
       AND issuance_snapshot IS NOT NULL AND jsonb_typeof(issuance_snapshot) = 'object'
       AND document_sha256 IS NOT NULL AND document_sha256 ~ '^[0-9a-f]{64}$')
    );
  END IF;
END $$;

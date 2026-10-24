-- End-semester result control: an explicit department owner and immutable HOD decisions.
-- Existing declared sessions are unchanged. Unassigned, undeclared sessions fail closed
-- until Exam Cell selects a department with an active HOD before reopening entry.
ALTER TABLE exam_result_sessions
  ADD COLUMN IF NOT EXISTS owner_department_id INT REFERENCES departments(dept_id);

ALTER TABLE exam_result_sessions
  ADD COLUMN IF NOT EXISTS entry_revision INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS exam_result_hod_decisions (
  decision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  session_id UUID NOT NULL REFERENCES exam_result_sessions(session_id),
  department_id INT NOT NULL REFERENCES departments(dept_id),
  input_hash CHAR(64) NOT NULL,
  decision VARCHAR(10) NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED')),
  decided_by UUID NOT NULL REFERENCES users(user_id),
  decision_comment TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_result_hod_decisions_session
  ON exam_result_hod_decisions(tenant_id, session_id, decided_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_result_hod_decision_revision
  ON exam_result_hod_decisions(tenant_id, session_id, input_hash);

-- The production API runs as a restricted existing role. Grant only the
-- new business table's ordinary CRUD privileges; schema and ledger authority
-- remain with the migration administrator. Local databases may omit the role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'falcon_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE exam_result_hod_decisions TO falcon_runtime;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION reject_exam_result_hod_decision_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'End-semester HOD decisions are append-only';
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid='exam_result_hod_decisions'::regclass
      AND tgname='trg_exam_result_hod_decision_immutable'
  ) THEN
    CREATE TRIGGER trg_exam_result_hod_decision_immutable
    BEFORE UPDATE OR DELETE ON exam_result_hod_decisions
    FOR EACH ROW EXECUTE FUNCTION reject_exam_result_hod_decision_mutation();
  END IF;
END;
$$;

-- Fortress guardrails: approval workflow tables + immutable ledger triggers

-- Approval workflow
CREATE TABLE IF NOT EXISTS fin_approval_requests (
  approval_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  required_role text NOT NULL DEFAULT 'CFO_OR_CHAIRMAN',
  amount numeric NOT NULL,
  approved_by uuid NULL,
  approved_at timestamptz NULL,
  rejected_by uuid NULL,
  rejected_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS fin_approval_requests_unique
  ON fin_approval_requests (tenant_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS fin_approval_otps (
  otp_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  approval_id uuid NOT NULL REFERENCES fin_approval_requests(approval_id) ON DELETE CASCADE,
  otp_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

-- Ledger immutability
CREATE OR REPLACE FUNCTION fortress_block_immutable_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_LEDGER: updates are forbidden; issue a reversal instead';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fortress_block_immutable_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_LEDGER: deletes are forbidden; issue a reversal instead';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_finance_journal_entries_no_update ON finance_journal_entries;
CREATE TRIGGER tr_finance_journal_entries_no_update
BEFORE UPDATE ON finance_journal_entries
FOR EACH ROW EXECUTE FUNCTION fortress_block_immutable_update();

DROP TRIGGER IF EXISTS tr_finance_journal_entries_no_delete ON finance_journal_entries;
CREATE TRIGGER tr_finance_journal_entries_no_delete
BEFORE DELETE ON finance_journal_entries
FOR EACH ROW EXECUTE FUNCTION fortress_block_immutable_delete();

DROP TRIGGER IF EXISTS tr_finance_journal_lines_no_update ON finance_journal_lines;
CREATE TRIGGER tr_finance_journal_lines_no_update
BEFORE UPDATE ON finance_journal_lines
FOR EACH ROW EXECUTE FUNCTION fortress_block_immutable_update();

DROP TRIGGER IF EXISTS tr_finance_journal_lines_no_delete ON finance_journal_lines;
CREATE TRIGGER tr_finance_journal_lines_no_delete
BEFORE DELETE ON finance_journal_lines
FOR EACH ROW EXECUTE FUNCTION fortress_block_immutable_delete();

-- Provisional bank-reconciliation workbench. Statement imports and matching
-- never create journal postings or alter the authoritative bank balance.
CREATE TABLE IF NOT EXISTS finance_bank_accounts (
  bank_account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  book_id UUID NOT NULL REFERENCES finance_books(book_id) ON DELETE RESTRICT,
  ledger_account_id UUID NOT NULL REFERENCES finance_ledger_accounts(ledger_account_id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL,
  masked_account_number TEXT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  revision BIGINT NOT NULL DEFAULT 1,
  created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, ledger_account_id),
  UNIQUE (bank_account_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS finance_bank_statement_uploads (
  upload_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  bank_account_id UUID NOT NULL REFERENCES finance_bank_accounts(bank_account_id) ON DELETE RESTRICT,
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  source_sha256 CHAR(64) NOT NULL,
  idempotency_key TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
  parsed_lines JSONB NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, bank_account_id, source_sha256),
  UNIQUE (tenant_id, bank_account_id, idempotency_key),
  UNIQUE (upload_id,tenant_id,bank_account_id),
  FOREIGN KEY (bank_account_id,tenant_id)
    REFERENCES finance_bank_accounts(bank_account_id,tenant_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS finance_bank_statements (
  statement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  bank_account_id UUID NOT NULL REFERENCES finance_bank_accounts(bank_account_id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  opening_balance NUMERIC(16,2) NOT NULL,
  closing_balance NUMERIC(16,2) NOT NULL,
  source_upload_id UUID NOT NULL UNIQUE REFERENCES finance_bank_statement_uploads(upload_id) ON DELETE RESTRICT,
  source_sha256 CHAR(64) NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  status TEXT NOT NULL DEFAULT 'REVIEW_PENDING'
    CHECK (status IN ('REVIEW_PENDING','RECONCILED')),
  revision BIGINT NOT NULL DEFAULT 1,
  imported_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start),
  UNIQUE (tenant_id, bank_account_id, idempotency_key),
  UNIQUE (tenant_id, bank_account_id, source_sha256),
  UNIQUE (statement_id,tenant_id),
  FOREIGN KEY (bank_account_id,tenant_id)
    REFERENCES finance_bank_accounts(bank_account_id,tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (source_upload_id,tenant_id,bank_account_id)
    REFERENCES finance_bank_statement_uploads(upload_id,tenant_id,bank_account_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS finance_bank_statement_lines (
  statement_line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  statement_id UUID NOT NULL REFERENCES finance_bank_statements(statement_id) ON DELETE RESTRICT,
  row_number INTEGER NOT NULL CHECK (row_number > 0),
  transaction_date DATE NOT NULL,
  value_date DATE,
  description TEXT NOT NULL,
  bank_reference TEXT,
  debit_amount NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  running_balance NUMERIC(16,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((debit_amount > 0 AND credit_amount = 0) OR
         (credit_amount > 0 AND debit_amount = 0)),
  UNIQUE (statement_id, row_number),
  UNIQUE (statement_line_id,tenant_id,statement_id),
  FOREIGN KEY (statement_id,tenant_id)
    REFERENCES finance_bank_statements(statement_id,tenant_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS finance_bank_matches (
  match_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  statement_id UUID NOT NULL REFERENCES finance_bank_statements(statement_id) ON DELETE RESTRICT,
  statement_line_id UUID NOT NULL REFERENCES finance_bank_statement_lines(statement_line_id) ON DELETE RESTRICT,
  journal_line_id UUID NOT NULL REFERENCES finance_journal_lines(line_id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'PROPOSED'
    CHECK (status IN ('PROPOSED','APPROVED','REJECTED')),
  reason TEXT NOT NULL,
  proposed_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  proposed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  idempotency_key TEXT NOT NULL,
  review_idempotency_key TEXT,
  payload_hash CHAR(64) NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1,
  CHECK (reviewed_by IS NULL OR reviewed_by <> proposed_by),
  CHECK ((status='PROPOSED' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_idempotency_key IS NULL)
      OR (status IN ('APPROVED','REJECTED') AND reviewed_by IS NOT NULL
          AND reviewed_at IS NOT NULL AND review_idempotency_key IS NOT NULL)),
  UNIQUE (tenant_id, statement_id, idempotency_key),
  FOREIGN KEY (statement_id,tenant_id)
    REFERENCES finance_bank_statements(statement_id,tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (statement_line_id,tenant_id,statement_id)
    REFERENCES finance_bank_statement_lines(statement_line_id,tenant_id,statement_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_bank_active_statement_match
  ON finance_bank_matches(statement_line_id) WHERE status IN ('PROPOSED','APPROVED');
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_bank_approved_journal_match
  ON finance_bank_matches(journal_line_id) WHERE status='APPROVED';

CREATE TABLE IF NOT EXISTS finance_bank_outstanding_items (
  outstanding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  statement_id UUID NOT NULL REFERENCES finance_bank_statements(statement_id) ON DELETE RESTRICT,
  journal_line_id UUID NOT NULL REFERENCES finance_journal_lines(line_id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('DEPOSIT_IN_TRANSIT','OUTSTANDING_PAYMENT')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PROPOSED'
    CHECK (status IN ('PROPOSED','APPROVED','REJECTED')),
  proposed_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  reviewed_by UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  proposed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  idempotency_key TEXT NOT NULL,
  review_idempotency_key TEXT,
  revision BIGINT NOT NULL DEFAULT 1,
  CHECK (reviewed_by IS NULL OR reviewed_by <> proposed_by),
  CHECK ((status='PROPOSED' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_idempotency_key IS NULL)
      OR (status IN ('APPROVED','REJECTED') AND reviewed_by IS NOT NULL
          AND reviewed_at IS NOT NULL AND review_idempotency_key IS NOT NULL)),
  UNIQUE (statement_id, idempotency_key),
  FOREIGN KEY (statement_id,tenant_id)
    REFERENCES finance_bank_statements(statement_id,tenant_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_bank_active_outstanding
  ON finance_bank_outstanding_items(statement_id,journal_line_id)
  WHERE status IN ('PROPOSED','APPROVED');

CREATE TABLE IF NOT EXISTS finance_bank_reconciliations (
  reconciliation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  statement_id UUID NOT NULL UNIQUE REFERENCES finance_bank_statements(statement_id) ON DELETE RESTRICT,
  ledger_revision BIGINT NOT NULL,
  ledger_closing_balance NUMERIC(16,2) NOT NULL,
  adjusted_bank_balance NUMERIC(16,2) NOT NULL,
  difference NUMERIC(16,2) NOT NULL,
  snapshot_hash CHAR(64) NOT NULL,
  idempotency_key TEXT NOT NULL,
  prepared_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  approved_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (prepared_by <> approved_by),
  CHECK (difference = 0),
  FOREIGN KEY (statement_id,tenant_id)
    REFERENCES finance_bank_statements(statement_id,tenant_id) ON DELETE RESTRICT
);

-- Imported statements and their rows are evidence, never editable source facts.
CREATE OR REPLACE FUNCTION finance_reject_bank_statement_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'FINANCE_BANK_STATEMENT_IMMUTABLE';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS tr_finance_bank_statement_immutable ON finance_bank_statements;
CREATE TRIGGER tr_finance_bank_statement_immutable
BEFORE DELETE ON finance_bank_statements
FOR EACH ROW EXECUTE FUNCTION finance_reject_bank_statement_mutation();
DROP TRIGGER IF EXISTS tr_finance_bank_statement_line_immutable ON finance_bank_statement_lines;
CREATE TRIGGER tr_finance_bank_statement_line_immutable
BEFORE UPDATE OR DELETE ON finance_bank_statement_lines
FOR EACH ROW EXECUTE FUNCTION finance_reject_bank_statement_mutation();

CREATE OR REPLACE FUNCTION finance_guard_bank_statement_status() RETURNS TRIGGER AS $$
BEGIN
  IF ROW(NEW.statement_id,NEW.tenant_id,NEW.bank_account_id,NEW.period_start,NEW.period_end,
         NEW.opening_balance,NEW.closing_balance,NEW.source_upload_id,NEW.source_sha256,
         NEW.idempotency_key,NEW.payload_hash,NEW.imported_by,NEW.imported_at)
     IS DISTINCT FROM
     ROW(OLD.statement_id,OLD.tenant_id,OLD.bank_account_id,OLD.period_start,OLD.period_end,
         OLD.opening_balance,OLD.closing_balance,OLD.source_upload_id,OLD.source_sha256,
         OLD.idempotency_key,OLD.payload_hash,OLD.imported_by,OLD.imported_at)
     OR OLD.status <> 'REVIEW_PENDING' OR NEW.status <> 'RECONCILED'
     OR NEW.revision <> OLD.revision+1
     OR NOT EXISTS (SELECT 1 FROM finance_bank_reconciliations
                    WHERE statement_id=OLD.statement_id AND tenant_id=OLD.tenant_id)
  THEN RAISE EXCEPTION 'FINANCE_BANK_STATEMENT_IMMUTABLE'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS tr_finance_bank_statement_status ON finance_bank_statements;
CREATE TRIGGER tr_finance_bank_statement_status
BEFORE UPDATE ON finance_bank_statements
FOR EACH ROW EXECUTE FUNCTION finance_guard_bank_statement_status();

CREATE OR REPLACE FUNCTION finance_guard_bank_review_record() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'FINANCE_BANK_REVIEW_IMMUTABLE'; END IF;
  IF OLD.status <> 'PROPOSED' OR NEW.status NOT IN ('APPROVED','REJECTED')
     OR NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.proposed_by
     OR NEW.reviewed_at IS NULL OR NEW.review_idempotency_key IS NULL
     OR NEW.revision <> OLD.revision+1
     OR (to_jsonb(NEW) - 'status' - 'reviewed_by' - 'reviewed_at'
         - 'review_idempotency_key' - 'revision') IS DISTINCT FROM
        (to_jsonb(OLD) - 'status' - 'reviewed_by' - 'reviewed_at'
         - 'review_idempotency_key' - 'revision')
  THEN RAISE EXCEPTION 'FINANCE_BANK_REVIEW_IMMUTABLE'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION finance_guard_bank_review_insert() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status <> 'PROPOSED' OR NEW.revision <> 1 OR NEW.reviewed_by IS NOT NULL
     OR NEW.reviewed_at IS NOT NULL OR NEW.review_idempotency_key IS NOT NULL
  THEN RAISE EXCEPTION 'FINANCE_BANK_REVIEW_INITIAL_STATE_INVALID'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS tr_finance_bank_match_insert ON finance_bank_matches;
CREATE TRIGGER tr_finance_bank_match_insert
BEFORE INSERT ON finance_bank_matches
FOR EACH ROW EXECUTE FUNCTION finance_guard_bank_review_insert();
DROP TRIGGER IF EXISTS tr_finance_bank_match_review ON finance_bank_matches;
CREATE TRIGGER tr_finance_bank_match_review
BEFORE UPDATE OR DELETE ON finance_bank_matches
FOR EACH ROW EXECUTE FUNCTION finance_guard_bank_review_record();
DROP TRIGGER IF EXISTS tr_finance_bank_outstanding_insert ON finance_bank_outstanding_items;
CREATE TRIGGER tr_finance_bank_outstanding_insert
BEFORE INSERT ON finance_bank_outstanding_items
FOR EACH ROW EXECUTE FUNCTION finance_guard_bank_review_insert();
DROP TRIGGER IF EXISTS tr_finance_bank_outstanding_review ON finance_bank_outstanding_items;
CREATE TRIGGER tr_finance_bank_outstanding_review
BEFORE UPDATE OR DELETE ON finance_bank_outstanding_items
FOR EACH ROW EXECUTE FUNCTION finance_guard_bank_review_record();
DROP TRIGGER IF EXISTS tr_finance_bank_reconciliation_immutable ON finance_bank_reconciliations;
CREATE TRIGGER tr_finance_bank_reconciliation_immutable
BEFORE UPDATE OR DELETE ON finance_bank_reconciliations
FOR EACH ROW EXECUTE FUNCTION finance_reject_bank_statement_mutation();

CREATE OR REPLACE FUNCTION finance_guard_bank_reconciliation_insert() RETURNS TRIGGER AS $$
DECLARE v_statement RECORD;
BEGIN
  SELECT tenant_id,imported_by,status INTO v_statement FROM finance_bank_statements
    WHERE statement_id=NEW.statement_id;
  IF v_statement.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR v_statement.imported_by IS DISTINCT FROM NEW.prepared_by
     OR v_statement.status <> 'REVIEW_PENDING'
     OR NEW.approved_by=NEW.prepared_by
     OR NOT EXISTS (SELECT 1 FROM finance_bank_statement_lines WHERE statement_id=NEW.statement_id)
  THEN RAISE EXCEPTION 'FINANCE_BANK_RECONCILIATION_SCOPE_INVALID'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS tr_finance_bank_reconciliation_insert ON finance_bank_reconciliations;
CREATE TRIGGER tr_finance_bank_reconciliation_insert
BEFORE INSERT ON finance_bank_reconciliations
FOR EACH ROW EXECUTE FUNCTION finance_guard_bank_reconciliation_insert();

CREATE OR REPLACE FUNCTION finance_guard_bank_account_mapping() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'FINANCE_BANK_MAPPING_IMMUTABLE'; END IF;
  IF OLD.status <> 'ACTIVE' OR NEW.status <> 'INACTIVE'
     OR NEW.revision <> OLD.revision+1
     OR (to_jsonb(NEW) - 'status' - 'revision') IS DISTINCT FROM
        (to_jsonb(OLD) - 'status' - 'revision')
  THEN RAISE EXCEPTION 'FINANCE_BANK_MAPPING_IMMUTABLE'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS tr_finance_bank_account_mapping ON finance_bank_accounts;
CREATE TRIGGER tr_finance_bank_account_mapping
BEFORE UPDATE OR DELETE ON finance_bank_accounts
FOR EACH ROW EXECUTE FUNCTION finance_guard_bank_account_mapping();

CREATE OR REPLACE FUNCTION finance_guard_bank_account_insert() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM finance_books b JOIN finance_ledger_accounts la
      ON la.tenant_id=b.tenant_id
    WHERE b.book_id=NEW.book_id AND b.tenant_id=NEW.tenant_id
      AND la.ledger_account_id=NEW.ledger_account_id
      AND la.account_type='ASSET' AND la.is_active=true
  ) THEN RAISE EXCEPTION 'FINANCE_BANK_ACCOUNT_SCOPE_INVALID'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS tr_finance_bank_account_insert ON finance_bank_accounts;
CREATE TRIGGER tr_finance_bank_account_insert
BEFORE INSERT ON finance_bank_accounts
FOR EACH ROW EXECUTE FUNCTION finance_guard_bank_account_insert();

CREATE OR REPLACE FUNCTION finance_guard_bank_ledger_link() RETURNS TRIGGER AS $$
DECLARE v_link RECORD; v_line RECORD; v_bank_line RECORD;
BEGIN
  SELECT s.tenant_id,s.period_start,s.period_end,ba.book_id,ba.ledger_account_id
    INTO v_link FROM finance_bank_statements s JOIN finance_bank_accounts ba
      ON ba.bank_account_id=s.bank_account_id AND ba.tenant_id=s.tenant_id
    WHERE s.statement_id=NEW.statement_id;
  SELECT je.tenant_id,je.book_id,je.entry_date,je.posting_status,
         jl.ledger_account_id,jl.debit_amount,jl.credit_amount
    INTO v_line FROM finance_journal_lines jl JOIN finance_journal_entries je
      ON je.journal_entry_id=jl.journal_entry_id
    WHERE jl.line_id=NEW.journal_line_id;
  IF v_link.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR v_line.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR v_line.book_id IS DISTINCT FROM v_link.book_id
     OR v_line.ledger_account_id IS DISTINCT FROM v_link.ledger_account_id
     OR v_line.posting_status <> 'POSTED' OR v_line.entry_date>v_link.period_end
  THEN RAISE EXCEPTION 'FINANCE_BANK_LEDGER_SCOPE_INVALID'; END IF;
  IF TG_TABLE_NAME='finance_bank_matches' THEN
    SELECT debit_amount,credit_amount INTO v_bank_line
      FROM finance_bank_statement_lines WHERE statement_line_id=NEW.statement_line_id;
    IF v_bank_line.debit_amount IS DISTINCT FROM v_line.credit_amount
       OR v_bank_line.credit_amount IS DISTINCT FROM v_line.debit_amount
    THEN RAISE EXCEPTION 'FINANCE_BANK_MATCH_AMOUNT_INVALID'; END IF;
  ELSE
    IF v_line.entry_date<v_link.period_start
       OR (NEW.kind='DEPOSIT_IN_TRANSIT' AND v_line.debit_amount<=0)
       OR (NEW.kind='OUTSTANDING_PAYMENT' AND v_line.credit_amount<=0)
    THEN RAISE EXCEPTION 'FINANCE_BANK_OUTSTANDING_INVALID'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS tr_finance_bank_match_scope ON finance_bank_matches;
CREATE TRIGGER tr_finance_bank_match_scope
BEFORE INSERT ON finance_bank_matches
FOR EACH ROW EXECUTE FUNCTION finance_guard_bank_ledger_link();
DROP TRIGGER IF EXISTS tr_finance_bank_outstanding_scope ON finance_bank_outstanding_items;
CREATE TRIGGER tr_finance_bank_outstanding_scope
BEFORE INSERT ON finance_bank_outstanding_items
FOR EACH ROW EXECUTE FUNCTION finance_guard_bank_ledger_link();

DROP TRIGGER IF EXISTS tr_finance_bank_upload_immutable ON finance_bank_statement_uploads;
CREATE TRIGGER tr_finance_bank_upload_immutable
BEFORE UPDATE OR DELETE ON finance_bank_statement_uploads
FOR EACH ROW EXECUTE FUNCTION finance_reject_bank_statement_mutation();

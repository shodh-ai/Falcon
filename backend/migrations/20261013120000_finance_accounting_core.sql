-- Expand-only accounting foundation. Existing journals remain LEGACY until a
-- tenant's audited opening balance and source adapters have been reconciled.
CREATE TABLE IF NOT EXISTS finance_books (
  book_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  legal_name TEXT NOT NULL,
  base_currency CHAR(3) NOT NULL DEFAULT 'INR',
  fiscal_start_month SMALLINT NOT NULL DEFAULT 4 CHECK (fiscal_start_month BETWEEN 1 AND 12),
  authority_status TEXT NOT NULL DEFAULT 'PROVISIONAL'
    CHECK (authority_status IN ('PROVISIONAL', 'OFFICIAL', 'PAUSED')),
  cutover_date DATE,
  ledger_sequence BIGINT NOT NULL DEFAULT 0,
  revision BIGINT NOT NULL DEFAULT 1,
  approved_by UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The two launch tenants get provisional books only. The tenant display name
-- is not an approved legal-name or opening-balance assertion.
INSERT INTO finance_books (tenant_id, legal_name)
SELECT tenant_id, name FROM tenants WHERE lower(subdomain) IN ('sgvu', 'gvmc')
ON CONFLICT (tenant_id) DO NOTHING;

-- GVMC previously had no default legacy account codes. Seed the same
-- provisional mappings used by SGVU so existing invoice processing does not
-- silently omit entries; accountant approval is still required for cutover.
INSERT INTO finance_ledger_accounts(tenant_id,account_code,account_name,account_type)
SELECT t.tenant_id,v.code,v.name,v.type
FROM tenants t
CROSS JOIN (VALUES
  ('1000','Cash & Bank','ASSET'),
  ('1100','Student Fee Receivable','ASSET'),
  ('2000','Accounts Payable','LIABILITY'),
  ('4000','Tuition Fee Income','INCOME'),
  ('4100','Other Fee Income','INCOME'),
  ('5000','Salary Expense','EXPENSE'),
  ('5100','Operating Expense','EXPENSE'),
  ('5200','GST Input Credit','ASSET'),
  ('5300','TDS Payable','LIABILITY')
) AS v(code,name,type)
WHERE lower(t.subdomain)='gvmc'
  AND NOT EXISTS (
    SELECT 1 FROM finance_ledger_accounts a
    WHERE a.tenant_id=t.tenant_id AND a.account_code=v.code
  );

CREATE TABLE IF NOT EXISTS finance_fiscal_periods (
  period_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES finance_books(book_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'CLOSING', 'CLOSED')),
  revision BIGINT NOT NULL DEFAULT 1,
  closed_by UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  closed_at TIMESTAMPTZ,
  close_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date),
  UNIQUE (book_id, start_date),
  UNIQUE (book_id, end_date)
);

CREATE INDEX IF NOT EXISTS idx_finance_period_tenant_date
  ON finance_fiscal_periods(tenant_id, start_date, end_date);

-- Provisional current-year periods make shadow postings testable without
-- granting official-book status or modifying any existing financial fact.
INSERT INTO finance_fiscal_periods(book_id, tenant_id, start_date, end_date)
SELECT b.book_id, b.tenant_id,
       (fy.start_date + (month_no.n || ' months')::interval)::date,
       ((fy.start_date + ((month_no.n + 1) || ' months')::interval)::date - 1)
FROM finance_books b
CROSS JOIN LATERAL (
  SELECT make_date(
    EXTRACT(YEAR FROM CURRENT_DATE)::integer
      - CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE)::integer < b.fiscal_start_month THEN 1 ELSE 0 END,
    b.fiscal_start_month, 1
  ) AS start_date
) fy
CROSS JOIN generate_series(0, 11) AS month_no(n)
WHERE b.authority_status = 'PROVISIONAL'
ON CONFLICT (book_id, start_date) DO NOTHING;

-- Payroll run keys are YYYY-MM strings, so source_id cannot remain UUID.
ALTER TABLE finance_journal_entries
  ALTER COLUMN source_id TYPE TEXT USING source_id::text;
ALTER TABLE finance_journal_entries
  ADD COLUMN IF NOT EXISTS book_id UUID REFERENCES finance_books(book_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS period_id UUID REFERENCES finance_fiscal_periods(period_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS posting_status TEXT NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN IF NOT EXISTS source_revision BIGINT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS payload_hash TEXT,
  ADD COLUMN IF NOT EXISTS book_sequence BIGINT,
  ADD COLUMN IF NOT EXISTS reversal_of UUID REFERENCES finance_journal_entries(journal_entry_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;

ALTER TABLE finance_journal_entries
  ADD CONSTRAINT finance_journal_posting_status_check
  CHECK (posting_status IN ('LEGACY', 'POSTED')) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_journal_idempotency
  ON finance_journal_entries(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_canonical_source_revision
  ON finance_journal_entries(book_id, source_type, source_id, source_revision)
  WHERE book_id IS NOT NULL AND source_id IS NOT NULL AND source_revision IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_book_sequence
  ON finance_journal_entries(book_id, book_sequence)
  WHERE book_id IS NOT NULL AND book_sequence IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_finance_journal_book_period
  ON finance_journal_entries(book_id, period_id, entry_date)
  WHERE book_id IS NOT NULL;

ALTER TABLE finance_journal_lines
  ADD COLUMN IF NOT EXISTS fund_id UUID,
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS department_id INTEGER,
  ADD COLUMN IF NOT EXISTS campus_id UUID,
  ADD COLUMN IF NOT EXISTS counterparty_id UUID,
  ADD COLUMN IF NOT EXISTS asset_record_id UUID,
  ADD COLUMN IF NOT EXISTS dimensions JSONB NOT NULL DEFAULT '{}'::jsonb;

-- A canonical line must be one-sided and must belong to the same tenant as
-- both its journal and account. Legacy history is not rewritten by this gate.
CREATE OR REPLACE FUNCTION finance_guard_new_journal_line() RETURNS TRIGGER AS $$
DECLARE
  v_entry RECORD;
  v_account RECORD;
  v_period RECORD;
BEGIN
  SELECT tenant_id, book_id, period_id, entry_date, posting_status
    INTO v_entry FROM finance_journal_entries
    WHERE journal_entry_id = NEW.journal_entry_id;
  SELECT tenant_id, is_active INTO v_account FROM finance_ledger_accounts
    WHERE ledger_account_id = NEW.ledger_account_id;
  IF v_entry.tenant_id IS DISTINCT FROM v_account.tenant_id THEN
    RAISE EXCEPTION 'FINANCE_CROSS_TENANT_ACCOUNT';
  END IF;
  IF v_entry.book_id IS NOT NULL THEN
    IF v_entry.posting_status <> 'POSTED'
       OR NOT v_account.is_active
       OR NOT ((NEW.debit_amount > 0 AND NEW.credit_amount = 0)
            OR (NEW.credit_amount > 0 AND NEW.debit_amount = 0)) THEN
      RAISE EXCEPTION 'FINANCE_INVALID_CANONICAL_LINE';
    END IF;
    SELECT book_id, tenant_id, start_date, end_date, status INTO v_period
      FROM finance_fiscal_periods WHERE period_id = v_entry.period_id;
    IF v_period.book_id IS DISTINCT FROM v_entry.book_id
       OR v_period.tenant_id IS DISTINCT FROM v_entry.tenant_id
       OR v_period.status <> 'OPEN'
       OR v_entry.entry_date NOT BETWEEN v_period.start_date AND v_period.end_date THEN
      RAISE EXCEPTION 'FINANCE_PERIOD_NOT_OPEN';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_finance_guard_new_journal_line ON finance_journal_lines;
CREATE TRIGGER tr_finance_guard_new_journal_line
BEFORE INSERT ON finance_journal_lines
FOR EACH ROW EXECUTE FUNCTION finance_guard_new_journal_line();

-- Deferred so header and lines can be inserted in one database transaction.
CREATE OR REPLACE FUNCTION finance_assert_canonical_journal_balanced() RETURNS TRIGGER AS $$
DECLARE
  v_count INTEGER;
  v_debit NUMERIC;
  v_credit NUMERIC;
  v_book_tenant UUID;
  v_period RECORD;
BEGIN
  IF NEW.book_id IS NULL THEN RETURN NULL; END IF;
  IF NEW.posting_status <> 'POSTED' OR NEW.source_id IS NULL
     OR NEW.idempotency_key IS NULL OR NEW.payload_hash IS NULL
     OR NEW.period_id IS NULL OR NEW.book_sequence IS NULL THEN
    RAISE EXCEPTION 'FINANCE_INCOMPLETE_CANONICAL_JOURNAL';
  END IF;
  SELECT tenant_id INTO v_book_tenant FROM finance_books WHERE book_id=NEW.book_id;
  SELECT book_id,tenant_id,start_date,end_date,status INTO v_period
    FROM finance_fiscal_periods WHERE period_id=NEW.period_id;
  IF v_book_tenant IS DISTINCT FROM NEW.tenant_id
     OR v_period.book_id IS DISTINCT FROM NEW.book_id
     OR v_period.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR v_period.status <> 'OPEN'
     OR NEW.entry_date NOT BETWEEN v_period.start_date AND v_period.end_date THEN
    RAISE EXCEPTION 'FINANCE_BOOK_OR_PERIOD_SCOPE_INVALID';
  END IF;
  SELECT COUNT(*), COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
    INTO v_count, v_debit, v_credit FROM finance_journal_lines
    WHERE journal_entry_id = NEW.journal_entry_id;
  IF v_count < 2 OR v_debit <= 0 OR v_debit <> v_credit THEN
    RAISE EXCEPTION 'FINANCE_UNBALANCED_JOURNAL: %, debit %, credit %',
      NEW.journal_entry_id, v_debit, v_credit;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_finance_canonical_journal_balanced ON finance_journal_entries;
CREATE CONSTRAINT TRIGGER tr_finance_canonical_journal_balanced
AFTER INSERT ON finance_journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION finance_assert_canonical_journal_balanced();

-- Posted canonical facts are append-only. A correction must be a separately
-- approved reversal/replacement, never an UPDATE or DELETE of the original.
CREATE OR REPLACE FUNCTION finance_reject_canonical_journal_mutation() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.book_id IS NOT NULL AND OLD.posting_status = 'POSTED' THEN
    RAISE EXCEPTION 'FINANCE_POSTED_JOURNAL_IMMUTABLE';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_finance_canonical_entry_immutable ON finance_journal_entries;
CREATE TRIGGER tr_finance_canonical_entry_immutable
BEFORE UPDATE OR DELETE ON finance_journal_entries
FOR EACH ROW EXECUTE FUNCTION finance_reject_canonical_journal_mutation();

CREATE OR REPLACE FUNCTION finance_reject_canonical_line_mutation() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM finance_journal_entries
    WHERE journal_entry_id = OLD.journal_entry_id
      AND book_id IS NOT NULL AND posting_status = 'POSTED'
  ) THEN
    RAISE EXCEPTION 'FINANCE_POSTED_JOURNAL_IMMUTABLE';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_finance_canonical_line_immutable ON finance_journal_lines;
CREATE TRIGGER tr_finance_canonical_line_immutable
BEFORE UPDATE OR DELETE ON finance_journal_lines
FOR EACH ROW EXECUTE FUNCTION finance_reject_canonical_line_mutation();

-- Existing books are audited, not automatically adopted. This view exposes
-- historical imbalances for cutover review without altering their evidence.
CREATE OR REPLACE VIEW finance_journal_integrity_audit AS
SELECT je.tenant_id, je.journal_entry_id, je.source_type, je.source_id,
       je.entry_date, COUNT(jl.line_id) AS line_count,
       COALESCE(SUM(jl.debit_amount), 0) AS debits,
       COALESCE(SUM(jl.credit_amount), 0) AS credits,
       COUNT(jl.line_id) FILTER (WHERE la.tenant_id IS DISTINCT FROM je.tenant_id)
         AS cross_tenant_lines
FROM finance_journal_entries je
LEFT JOIN finance_journal_lines jl ON jl.journal_entry_id = je.journal_entry_id
LEFT JOIN finance_ledger_accounts la ON la.ledger_account_id = jl.ledger_account_id
GROUP BY je.tenant_id, je.journal_entry_id, je.source_type, je.source_id, je.entry_date;

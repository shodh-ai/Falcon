-- Demo-only records for SGVU Finance presentations. These tables are not
-- referenced by the canonical journal, payment, invoice or expense ledgers.
CREATE TABLE IF NOT EXISTS finance_demo_books (
  book_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT TRUE CHECK (is_demo),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, owner_user_id, code)
);

CREATE TABLE IF NOT EXISTS finance_demo_records (
  record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES finance_demo_books(book_id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('INVOICE', 'EXPENSE', 'PAYMENT', 'JOURNAL')),
  reference TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL,
  occurred_on DATE NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (book_id, record_type, reference)
);

CREATE INDEX IF NOT EXISTS idx_finance_demo_records_book_type
  ON finance_demo_records (book_id, record_type, occurred_on DESC);

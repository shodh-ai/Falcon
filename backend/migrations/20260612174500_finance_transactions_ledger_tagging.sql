-- Add tagging for raw transactions for owner analytics

ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS ledger_category varchar(80) NULL,
  ADD COLUMN IF NOT EXISTS direction varchar(3) NULL,
  ADD COLUMN IF NOT EXISTS txn_kind varchar(30) NULL;

CREATE INDEX IF NOT EXISTS idx_finance_transactions_tenant_created
  ON finance_transactions(created_at);

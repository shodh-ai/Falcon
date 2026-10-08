-- Student fee payment integrity: speed ownership lookups and INITIATED → SUCCESS settle.
CREATE INDEX IF NOT EXISTS idx_finance_txn_student_status
  ON finance_transactions (student_user_id, status);

CREATE INDEX IF NOT EXISTS idx_finance_txn_demand_status
  ON finance_transactions (demand_id, status);

CREATE INDEX IF NOT EXISTS idx_finance_demands_student_status
  ON finance_fee_demands (student_user_id, status);

-- Soft-delete columns (Chairman zero-deletion policy) when missing from legacy DBs.
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
ALTER TABLE finance_fee_demands
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

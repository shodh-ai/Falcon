-- Additive recovery ledger. No files, business rows or existing references change.
-- No cascading business-row foreign keys: preserve evidence if a parent is removed.
CREATE TABLE IF NOT EXISTS finance_receipt_versions (
  version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  transaction_id UUID NOT NULL,
  receipt_number VARCHAR(120),
  receipt_url TEXT NOT NULL,
  sha256 CHAR(64),
  source VARCHAR(20) NOT NULL CHECK (source IN ('LEGACY', 'GENERATED', 'MANUAL')),
  actor_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, transaction_id, receipt_url)
);
CREATE INDEX IF NOT EXISTS idx_finance_receipt_versions_transaction
  ON finance_receipt_versions (tenant_id, transaction_id, created_at);

-- Align the legacy ORM policy model with the existing UUID-backed table.
-- Expand-only: historical policy rows and global (tenant-null) defaults remain.
ALTER TABLE finance_late_fine_policies
  ADD COLUMN IF NOT EXISTS applies_to_fee_head VARCHAR(40),
  ADD COLUMN IF NOT EXISTS effective_from DATE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

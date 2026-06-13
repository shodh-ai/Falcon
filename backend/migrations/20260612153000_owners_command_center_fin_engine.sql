-- Owner’s Command Center financial engine foundations

-- 1) Strict tagging for executive charts
ALTER TABLE finance_journal_lines
ADD COLUMN IF NOT EXISTS ledger_category VARCHAR(80);

CREATE INDEX IF NOT EXISTS idx_fin_journal_lines_category
  ON finance_journal_lines(ledger_category);

-- 2) Configurable allocation rules for inflow splitting (e.g., Razorpay fee payment splits)
CREATE TABLE IF NOT EXISTS finance_allocation_rules (
  rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  fee_head VARCHAR(60) NOT NULL,
  program_code VARCHAR(60) NULL,
  template_id UUID NULL,
  ledger_category VARCHAR(80) NOT NULL,
  weight NUMERIC(8, 4) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, fee_head, program_code, template_id, ledger_category)
);

CREATE INDEX IF NOT EXISTS idx_fin_alloc_rules_lookup
  ON finance_allocation_rules(tenant_id, fee_head, program_code, template_id)
  WHERE is_active = true;

-- 3) Bank-feed daily balances (authoritative starting point for Waterfall)
CREATE TABLE IF NOT EXISTS bank_balance_snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  bank_account_key VARCHAR(80) NOT NULL,
  balance_date DATE NOT NULL,
  closing_balance NUMERIC(14, 2) NOT NULL,
  source VARCHAR(30) NOT NULL DEFAULT 'BANK_FEED',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, bank_account_key, balance_date)
);

CREATE INDEX IF NOT EXISTS idx_bank_balance_snapshots_tenant_date
  ON bank_balance_snapshots(tenant_id, balance_date DESC);

-- 4) Owner-only access control (allowlist) — enables board expansion without code changes
CREATE TABLE IF NOT EXISTS owner_access_control (
  access_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  role_label VARCHAR(60) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

-- 5) Daily brief persistence (8:00 AM cron-generated)
CREATE TABLE IF NOT EXISTS owner_daily_briefs (
  brief_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  brief_date DATE NOT NULL,
  bullets JSONB NOT NULL DEFAULT '[]'::jsonb,
  sources JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, brief_date)
);

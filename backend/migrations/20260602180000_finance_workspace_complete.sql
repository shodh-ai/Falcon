-- Falcon Finance & Accounts — DECIMAL(12,2) for all monetary columns (no FLOAT/REAL)

-- ---------------------------------------------------------------------------
-- Student fee core (bootstrap if missing from legacy DB)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance_fee_demands (
  demand_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(tenant_id),
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  fee_head VARCHAR(40) NOT NULL,
  academic_year VARCHAR(12) NOT NULL,
  semester INT NULL,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  due_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  fee_breakup JSONB NULL,
  template_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_transactions (
  transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(tenant_id),
  demand_id UUID NULL REFERENCES finance_fee_demands(demand_id) ON DELETE SET NULL,
  student_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  gateway VARCHAR(20) NOT NULL DEFAULT 'RAZORPAY',
  gateway_reference VARCHAR(120) NULL,
  gateway_order_id VARCHAR(100) NULL,
  gateway_payment_id VARCHAR(100) NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  status VARCHAR(20) NOT NULL DEFAULT 'INITIATED',
  payment_mode VARCHAR(50) NULL,
  receipt_url TEXT NULL,
  gateway_payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_txn_gateway_payment
  ON finance_transactions(gateway_payment_id) WHERE gateway_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_txn_gateway_order
  ON finance_transactions(gateway_order_id) WHERE gateway_order_id IS NOT NULL;

ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS gateway_order_id VARCHAR(100);
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS gateway_payment_id VARCHAR(100);
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50);
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS receipt_url TEXT;

ALTER TABLE finance_fee_demands ADD COLUMN IF NOT EXISTS template_id UUID NULL;

CREATE TABLE IF NOT EXISTS finance_late_fine_policies (
  policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(tenant_id),
  policy_name VARCHAR(120) NOT NULL,
  slabs JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fee structure templates (batch/program wise)
CREATE TABLE IF NOT EXISTS finance_fee_templates (
  template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  template_name VARCHAR(180) NOT NULL,
  program_code VARCHAR(60) NULL,
  batch_year INT NULL,
  academic_year VARCHAR(12) NOT NULL,
  semester INT NULL,
  fee_breakup JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, template_name)
);

ALTER TABLE finance_fee_demands
  DROP CONSTRAINT IF EXISTS finance_fee_demands_template_id_fkey;
ALTER TABLE finance_fee_demands
  ADD CONSTRAINT finance_fee_demands_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES finance_fee_templates(template_id) ON DELETE SET NULL;

-- Vendors (GST/TDS compliance)
CREATE TABLE IF NOT EXISTS fin_vendors (
  vendor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  business_name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255) NULL,
  gstin VARCHAR(15) NULL,
  pan_number VARCHAR(10) NULL,
  default_tds_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  bank_account_no VARCHAR(50) NULL,
  ifsc_code VARCHAR(20) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, gstin)
);

-- Department budgets (annual allocation vs utilization)
CREATE TABLE IF NOT EXISTS fin_budgets (
  budget_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  department_id INT NULL REFERENCES departments(dept_id) ON DELETE SET NULL,
  financial_year VARCHAR(9) NOT NULL,
  allocated_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  utilized_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, department_id, financial_year)
);

CREATE TABLE IF NOT EXISTS finance_ledger_accounts (
  ledger_account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  account_code VARCHAR(40) NOT NULL,
  account_name VARCHAR(180) NOT NULL,
  account_type VARCHAR(40) NOT NULL CHECK (account_type IN ('ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY')),
  parent_ledger_account_id UUID NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, account_code)
);

CREATE TABLE IF NOT EXISTS finance_expense_heads (
  expense_head_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  head_code VARCHAR(40) NOT NULL,
  head_name VARCHAR(180) NOT NULL,
  ledger_account_id UUID NULL REFERENCES finance_ledger_accounts(ledger_account_id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, head_code)
);

-- Double-entry journal
CREATE TABLE IF NOT EXISTS finance_journal_entries (
  journal_entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  narration TEXT NOT NULL,
  source_type VARCHAR(30) NOT NULL,
  source_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_journal_lines (
  line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES finance_journal_entries(journal_entry_id) ON DELETE CASCADE,
  ledger_account_id UUID NOT NULL REFERENCES finance_ledger_accounts(ledger_account_id) ON DELETE RESTRICT,
  debit_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  credit_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  CHECK (debit_amount >= 0 AND credit_amount >= 0)
);

-- Vendor bills (linked to fin_vendors for GST/TDS)
CREATE TABLE IF NOT EXISTS fin_vendor_invoices (
  invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES fin_vendors(vendor_id) ON DELETE RESTRICT,
  invoice_number VARCHAR(120) NOT NULL,
  invoice_date DATE NOT NULL,
  expense_head_id UUID NULL REFERENCES finance_expense_heads(expense_head_id) ON DELETE SET NULL,
  taxable_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  gst_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  tds_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  net_payable NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, vendor_id, invoice_number)
);

-- Bulk demand generation job tracking
CREATE TABLE IF NOT EXISTS finance_bulk_jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  template_id UUID NULL REFERENCES finance_fee_templates(template_id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'QUEUED',
  generated_count INT NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL
);

-- Seed default ledger accounts for tenant SGVU demo
INSERT INTO finance_ledger_accounts (tenant_id, account_code, account_name, account_type)
SELECT t.tenant_id, v.code, v.name, v.typ
FROM public.tenants t
CROSS JOIN (VALUES
  ('1000', 'Cash & Bank', 'ASSET'),
  ('1100', 'Student Fee Receivable', 'ASSET'),
  ('2000', 'Accounts Payable', 'LIABILITY'),
  ('4000', 'Tuition Fee Income', 'INCOME'),
  ('4100', 'Other Fee Income', 'INCOME'),
  ('5000', 'Salary Expense', 'EXPENSE'),
  ('5100', 'Operating Expense', 'EXPENSE'),
  ('5200', 'GST Input Credit', 'ASSET'),
  ('5300', 'TDS Payable', 'LIABILITY')
) AS v(code, name, typ)
WHERE t.subdomain = 'sgvu'
ON CONFLICT (tenant_id, account_code) DO NOTHING;

INSERT INTO finance_expense_heads (tenant_id, head_code, head_name)
SELECT t.tenant_id, v.code, v.name
FROM public.tenants t
CROSS JOIN (VALUES
  ('MAINT', 'Campus Maintenance'),
  ('LAB', 'Laboratory & Equipment'),
  ('IT', 'IT Software & Licenses'),
  ('CATER', 'Catering & Hospitality')
) AS v(code, name)
WHERE t.subdomain = 'sgvu'
ON CONFLICT (tenant_id, head_code) DO NOTHING;

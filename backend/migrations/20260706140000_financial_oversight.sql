-- Financial Oversight — Chairman macro budget, treasury, debt/FD, CAPEX/OPEX

ALTER TABLE fin_dept_budgets ADD COLUMN IF NOT EXISTS capex_allocated DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE fin_dept_budgets ADD COLUMN IF NOT EXISTS opex_allocated DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE fin_dept_budgets ADD COLUMN IF NOT EXISTS budget_limit_mode VARCHAR(20) NOT NULL DEFAULT 'SOFT_WARNING'
  CHECK (budget_limit_mode IN ('HARD_STOP', 'SOFT_WARNING'));

UPDATE fin_dept_budgets
SET capex_allocated = ROUND(allocated_amount * 0.35, 2),
    opex_allocated = ROUND(allocated_amount * 0.65, 2)
WHERE capex_allocated = 0 AND opex_allocated = 0 AND allocated_amount > 0;

CREATE TABLE IF NOT EXISTS fin_budget_reappropriations (
  reappropriation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  financial_year VARCHAR(10) NOT NULL,
  from_budget_id UUID NOT NULL REFERENCES fin_dept_budgets(budget_id) ON DELETE CASCADE,
  to_budget_id UUID NOT NULL REFERENCES fin_dept_budgets(budget_id) ON DELETE CASCADE,
  amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  reason TEXT,
  approved_by UUID NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fin_debt_facilities (
  facility_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  lender_name VARCHAR(200) NOT NULL,
  purpose TEXT,
  principal_amount DECIMAL(15,2) NOT NULL,
  principal_remaining DECIMAL(15,2) NOT NULL,
  interest_rate_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  emi_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  next_emi_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fin_fixed_deposits (
  fd_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  bank_name VARCHAR(200) NOT NULL,
  principal DECIMAL(15,2) NOT NULL,
  interest_rate_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  maturity_date DATE NOT NULL,
  interest_yielded DECIMAL(15,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'MATURED', 'RENEWED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fin_purchase_orders DROP CONSTRAINT IF EXISTS fin_purchase_orders_status_check;
ALTER TABLE fin_purchase_orders ADD CONSTRAINT fin_purchase_orders_status_check
  CHECK (status IN ('PENDING', 'PENDING_BOARD_APPROVAL', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED'));

ALTER TABLE fin_expenses ADD COLUMN IF NOT EXISTS expenditure_type VARCHAR(10) NOT NULL DEFAULT 'OPEX'
  CHECK (expenditure_type IN ('CAPEX', 'OPEX'));

CREATE INDEX IF NOT EXISTS idx_fin_reappropriations_tenant ON fin_budget_reappropriations(tenant_id, financial_year);
CREATE INDEX IF NOT EXISTS idx_fin_debt_tenant ON fin_debt_facilities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fin_fd_tenant ON fin_fixed_deposits(tenant_id);

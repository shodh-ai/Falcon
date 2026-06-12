-- FP&A Budget Hierarchy Engine (University → Department → Program/Event)

-- Master university budget cap per financial year
CREATE TABLE IF NOT EXISTS fin_university_budgets (
  university_budget_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  financial_year VARCHAR(10) NOT NULL,
  total_allocated DECIMAL(15,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'LOCKED')),
  locked_at TIMESTAMPTZ,
  locked_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, financial_year)
);

-- Tier 1: Department Master Budget
CREATE TABLE IF NOT EXISTS fin_dept_budgets (
  budget_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  university_budget_id UUID REFERENCES fin_university_budgets(university_budget_id) ON DELETE SET NULL,
  financial_year VARCHAR(10) NOT NULL,
  department_id INT REFERENCES departments(dept_id) ON DELETE SET NULL,
  allocated_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  encumbered_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  utilized_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  allocated_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'LOCKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (tenant_id, department_id, financial_year)
);

-- Tier 2: Program / Event budgets carved from department
CREATE TABLE IF NOT EXISTS fin_program_budgets (
  program_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES fin_dept_budgets(budget_id) ON DELETE CASCADE,
  program_name VARCHAR(255) NOT NULL,
  program_type VARCHAR(50) DEFAULT 'EVENT',
  allocated_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  encumbered_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  utilized_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Purchase orders (encumbrance — committed but not yet paid)
CREATE TABLE IF NOT EXISTS fin_purchase_orders (
  po_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  program_id UUID REFERENCES fin_program_budgets(program_id) ON DELETE SET NULL,
  budget_id UUID REFERENCES fin_dept_budgets(budget_id) ON DELETE SET NULL,
  vendor_id UUID REFERENCES fin_vendors(vendor_id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED')),
  requested_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Tier 3: Ground-truth expense rows
CREATE TABLE IF NOT EXISTS fin_expenses (
  expense_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  program_id UUID REFERENCES fin_program_budgets(program_id) ON DELETE SET NULL,
  budget_id UUID REFERENCES fin_dept_budgets(budget_id) ON DELETE SET NULL,
  po_id UUID REFERENCES fin_purchase_orders(po_id) ON DELETE SET NULL,
  vendor_id UUID REFERENCES fin_vendors(vendor_id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES fin_vendor_invoices(invoice_id) ON DELETE SET NULL,
  expense_head_id UUID REFERENCES finance_expense_heads(expense_head_id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  approved_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Budget expansion requests (Chairman escalation)
CREATE TABLE IF NOT EXISTS fin_budget_expansion_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  budget_id UUID REFERENCES fin_dept_budgets(budget_id) ON DELETE CASCADE,
  program_id UUID REFERENCES fin_program_budgets(program_id) ON DELETE SET NULL,
  requested_amount DECIMAL(15,2) NOT NULL,
  reason TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  requested_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fin_vendor_invoices ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES fin_program_budgets(program_id) ON DELETE SET NULL;
ALTER TABLE fin_vendor_invoices ADD COLUMN IF NOT EXISTS dept_budget_id UUID REFERENCES fin_dept_budgets(budget_id) ON DELETE SET NULL;
ALTER TABLE fin_vendor_invoices ADD COLUMN IF NOT EXISTS po_id UUID REFERENCES fin_purchase_orders(po_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fin_dept_budgets_tenant_fy ON fin_dept_budgets (tenant_id, financial_year);
CREATE INDEX IF NOT EXISTS idx_fin_program_budgets_budget ON fin_program_budgets (budget_id);
CREATE INDEX IF NOT EXISTS idx_fin_expenses_program ON fin_expenses (program_id);
CREATE INDEX IF NOT EXISTS idx_fin_purchase_orders_program ON fin_purchase_orders (program_id);

-- Migrate legacy fin_budgets into fin_dept_budgets where missing
INSERT INTO fin_dept_budgets (tenant_id, financial_year, department_id, allocated_amount, utilized_amount, status)
SELECT b.tenant_id, b.financial_year, b.department_id, b.allocated_amount, b.utilized_amount, 'ACTIVE'
FROM fin_budgets b
WHERE b.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM fin_dept_budgets d
    WHERE d.tenant_id = b.tenant_id AND d.department_id = b.department_id AND d.financial_year = b.financial_year
  );

-- Demo FP&A seed for SGVU tenant (visual review)
INSERT INTO fin_university_budgets (tenant_id, financial_year, total_allocated, status)
SELECT t.tenant_id, '2026-2027', 1000000000, 'LOCKED'
FROM public.tenants t WHERE t.subdomain = 'sgvu'
ON CONFLICT (tenant_id, financial_year) DO NOTHING;

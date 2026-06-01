-- Promotion workflow history (referenced by HR promotions page)
CREATE TABLE IF NOT EXISTS hr_promotion_history (
  promotion_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  employee_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  from_designation VARCHAR(140),
  to_designation VARCHAR(140) NOT NULL,
  effective_date DATE NOT NULL,
  api_score NUMERIC(8,2),
  approved_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  order_document_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_promotion_history_employee
  ON hr_promotion_history(tenant_id, employee_user_id, effective_date DESC);

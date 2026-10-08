-- Fabless work orders: COO triage → optional P2P PR → completion

ALTER TABLE lab_partner_work_orders
  ADD COLUMN IF NOT EXISTS accepted_by UUID REFERENCES users(user_id),
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pr_id UUID REFERENCES fin_purchase_requisitions(pr_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_lab_partner_wo_tenant_status
  ON lab_partner_work_orders(tenant_id, status, created_at DESC);

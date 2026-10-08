-- Track 6: ESM + P2P + COO ops

CREATE TABLE IF NOT EXISTS helpdesk_sla_policies (
  policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  category VARCHAR(40) NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  first_response_mins INT NOT NULL DEFAULT 240,
  resolve_mins INT NOT NULL DEFAULT 1440,
  UNIQUE (tenant_id, category, priority)
);

CREATE TABLE IF NOT EXISTS helpdesk_queues (
  queue_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category VARCHAR(40) NOT NULL,
  campus_id UUID,
  building_id UUID,
  assignee_role TEXT NOT NULL DEFAULT 'EstateOfficer'
);

CREATE TABLE IF NOT EXISTS helpdesk_ticket_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  actor_user_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS helpdesk_locations (
  location_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  building TEXT,
  qr_code VARCHAR(64) NOT NULL,
  default_category VARCHAR(40) NOT NULL DEFAULT 'FACILITIES',
  UNIQUE (tenant_id, qr_code)
);

ALTER TABLE helpdesk_tickets ADD COLUMN IF NOT EXISTS queue_id UUID;
ALTER TABLE helpdesk_tickets ADD COLUMN IF NOT EXISTS location_id UUID;
ALTER TABLE helpdesk_tickets ADD COLUMN IF NOT EXISTS sla_paused_at TIMESTAMPTZ;
ALTER TABLE helpdesk_tickets ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS fin_dofa_rules (
  dofa_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  role_name VARCHAR(64) NOT NULL,
  max_amount_inr NUMERIC(15,2) NOT NULL,
  expense_head TEXT,
  dept_id INT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_dofa_role
  ON fin_dofa_rules(tenant_id, role_name);

CREATE TABLE IF NOT EXISTS fin_po_lines (
  line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES fin_purchase_orders(po_id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  qty NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(15,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fin_goods_receipts (
  grn_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  po_id UUID NOT NULL REFERENCES fin_purchase_orders(po_id) ON DELETE CASCADE,
  received_by UUID REFERENCES users(user_id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS fin_grn_lines (
  grn_line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id UUID NOT NULL REFERENCES fin_goods_receipts(grn_id) ON DELETE CASCADE,
  po_line_id UUID REFERENCES fin_po_lines(line_id) ON DELETE SET NULL,
  description TEXT,
  qty_received NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fin_vendor_penalties (
  penalty_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES fin_vendors(vendor_id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  amount_inr NUMERIC(15,2) NOT NULL,
  auto_applied BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
DECLARE tid UUID;
BEGIN
  SELECT tenant_id INTO tid FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF tid IS NULL THEN SELECT tenant_id INTO tid FROM tenants LIMIT 1; END IF;
  IF tid IS NULL THEN RETURN; END IF;

  INSERT INTO helpdesk_sla_policies (tenant_id, category, priority, first_response_mins, resolve_mins)
  SELECT tid, v.category, 'NORMAL', v.fr, v.res
  FROM (VALUES
    ('FACILITIES', 120, 1440),
    ('IT', 60, 480),
    ('HOSTEL', 180, 1440)
  ) AS v(category, fr, res)
  WHERE NOT EXISTS (
    SELECT 1 FROM helpdesk_sla_policies p
    WHERE p.tenant_id = tid AND p.category = v.category AND p.priority = 'NORMAL'
  );

  INSERT INTO helpdesk_queues (tenant_id, name, category, assignee_role)
  SELECT tid, 'Estate Facilities', 'FACILITIES', 'EstateOfficer'
  WHERE NOT EXISTS (SELECT 1 FROM helpdesk_queues WHERE tenant_id = tid AND name = 'Estate Facilities');

  INSERT INTO helpdesk_locations (tenant_id, label, building, qr_code, default_category)
  SELECT tid, v.label, v.building, v.qr, 'FACILITIES'
  FROM (VALUES
    ('Main Canteen', 'Block A', 'QR-CANTEEN-01'),
    ('Tokamak Lab Gate', 'Labs', 'QR-LAB-GATE')
  ) AS v(label, building, qr)
  WHERE NOT EXISTS (
    SELECT 1 FROM helpdesk_locations l WHERE l.tenant_id = tid AND l.qr_code = v.qr
  );

  INSERT INTO fin_dofa_rules (tenant_id, role_name, max_amount_inr)
  SELECT tid, v.role_name, v.max_amount
  FROM (VALUES
    ('LabAdmin', 200000::numeric),
    ('Accountant', 50000::numeric),
    ('COO', 1000000::numeric)
  ) AS v(role_name, max_amount)
  WHERE NOT EXISTS (
    SELECT 1 FROM fin_dofa_rules r WHERE r.tenant_id = tid AND r.role_name = v.role_name
  );
END $$;

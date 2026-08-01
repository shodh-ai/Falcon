-- Digital DOFA anti-fraud: PR/quotes/L1, SoD GRN, catalog, GST fields, HOD limit

INSERT INTO roles (role_name, description)
VALUES
  ('Stores', 'Campus stores / goods receipt receiver'),
  ('Security', 'Gate security for goods receipt')
ON CONFLICT (role_name) DO UPDATE
SET description = EXCLUDED.description;

ALTER TABLE fin_vendors
  ADD COLUMN IF NOT EXISTS gst_verify_status VARCHAR(40) DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS gst_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gst_legal_name TEXT,
  ADD COLUMN IF NOT EXISTS pan_from_gst VARCHAR(10),
  ADD COLUMN IF NOT EXISTS related_party_hash VARCHAR(64);

ALTER TABLE fin_goods_receipts
  ADD COLUMN IF NOT EXISTS photo_path TEXT,
  ADD COLUMN IF NOT EXISTS challan_path TEXT,
  ADD COLUMN IF NOT EXISTS received_at_gate BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE fin_purchase_orders
  ADD COLUMN IF NOT EXISTS pr_id UUID,
  ADD COLUMN IF NOT EXISTS catalog_item_id UUID,
  ADD COLUMN IF NOT EXISTS dofa_auto_approved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS l2_exception BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS fin_quote_rules (
  rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  min_amount_inr NUMERIC(15,2) NOT NULL DEFAULT 0,
  max_amount_inr NUMERIC(15,2),
  min_quotes INT NOT NULL DEFAULT 1,
  require_gst_verify BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tenant_id, min_amount_inr)
);

CREATE TABLE IF NOT EXISTS fin_catalog_items (
  catalog_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  sku VARCHAR(64) NOT NULL,
  name TEXT NOT NULL,
  category VARCHAR(80),
  unit VARCHAR(40) NOT NULL DEFAULT 'unit',
  locked_unit_price NUMERIC(15,2) NOT NULL,
  vendor_id UUID REFERENCES fin_vendors(vendor_id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, sku)
);

CREATE TABLE IF NOT EXISTS fin_catalog_vendors (
  catalog_vendor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES fin_vendors(vendor_id) ON DELETE CASCADE,
  contract_label TEXT,
  contract_year INT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tenant_id, vendor_id, contract_year)
);

CREATE TABLE IF NOT EXISTS fin_purchase_requisitions (
  pr_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  requested_by UUID REFERENCES users(user_id),
  dept_id INT,
  description TEXT NOT NULL,
  amount_estimate NUMERIC(15,2) NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  selected_vendor_id UUID REFERENCES fin_vendors(vendor_id) ON DELETE SET NULL,
  selected_quote_id UUID,
  l2_justification TEXT,
  escalated BOOLEAN NOT NULL DEFAULT false,
  catalog_item_id UUID REFERENCES fin_catalog_items(catalog_item_id) ON DELETE SET NULL,
  catalog_qty NUMERIC(12,2),
  po_id UUID REFERENCES fin_purchase_orders(po_id) ON DELETE SET NULL,
  dofa_limit_at_submit NUMERIC(15,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fin_quotations (
  quote_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id UUID NOT NULL REFERENCES fin_purchase_requisitions(pr_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES fin_vendors(vendor_id) ON DELETE SET NULL,
  vendor_name TEXT NOT NULL,
  gstin VARCHAR(15) NOT NULL,
  amount_inr NUMERIC(15,2) NOT NULL,
  pdf_path TEXT NOT NULL,
  is_system_l1 BOOLEAN NOT NULL DEFAULT false,
  gst_verify_status VARCHAR(40) NOT NULL DEFAULT 'UNVERIFIED',
  gst_verify_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  related_party_hash VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_pr_tenant_status
  ON fin_purchase_requisitions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_fin_quotations_pr
  ON fin_quotations(pr_id);
CREATE INDEX IF NOT EXISTS idx_fin_po_vendor_created
  ON fin_purchase_orders(tenant_id, vendor_id, created_at)
  WHERE deleted_at IS NULL;

DO $$
DECLARE tid UUID;
DECLARE vid UUID;
BEGIN
  SELECT tenant_id INTO tid FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF tid IS NULL THEN SELECT tenant_id INTO tid FROM tenants LIMIT 1; END IF;
  IF tid IS NULL THEN RETURN; END IF;

  INSERT INTO fin_dofa_rules (tenant_id, role_name, max_amount_inr)
  SELECT tid, 'HOD', 25000::numeric
  WHERE NOT EXISTS (
    SELECT 1 FROM fin_dofa_rules r WHERE r.tenant_id = tid AND r.role_name = 'HOD'
  );

  INSERT INTO fin_quote_rules (tenant_id, min_amount_inr, max_amount_inr, min_quotes, require_gst_verify)
  SELECT tid, v.min_a, v.max_a, v.min_q, true
  FROM (VALUES
    (0::numeric, 49999.99::numeric, 1),
    (50000::numeric, 500000::numeric, 3),
    (500000.01::numeric, NULL::numeric, 3)
  ) AS v(min_a, max_a, min_q)
  WHERE NOT EXISTS (
    SELECT 1 FROM fin_quote_rules r
    WHERE r.tenant_id = tid AND r.min_amount_inr = v.min_a
  );

  INSERT INTO fin_vendors (tenant_id, business_name, gstin, pan_number, is_active, gst_verify_status)
  SELECT tid, 'SGVU Preferred Supplies Pvt Ltd', '08AABCU9603R1ZM', 'AABCU9603R', true, 'PENDING_CREDENTIALS'
  WHERE NOT EXISTS (
    SELECT 1 FROM fin_vendors v WHERE v.tenant_id = tid AND v.gstin = '08AABCU9603R1ZM'
  );

  SELECT vendor_id INTO vid FROM fin_vendors
  WHERE tenant_id = tid AND gstin = '08AABCU9603R1ZM' LIMIT 1;

  IF vid IS NOT NULL THEN
    INSERT INTO fin_catalog_vendors (tenant_id, vendor_id, contract_label, contract_year, is_active)
    SELECT tid, vid, 'Annual campus consumables 2026', 2026, true
    WHERE NOT EXISTS (
      SELECT 1 FROM fin_catalog_vendors cv
      WHERE cv.tenant_id = tid AND cv.vendor_id = vid AND cv.contract_year = 2026
    );

    INSERT INTO fin_catalog_items (
      tenant_id, sku, name, category, unit, locked_unit_price, vendor_id, is_active, effective_from
    )
    SELECT tid, v.sku, v.name, v.category, v.unit, v.price, vid, true, CURRENT_DATE
    FROM (VALUES
      ('FIL-PLA-1KG', '3D Printer PLA Filament 1kg', 'Labs', 'kg', 1500::numeric),
      ('PAPER-A4-5R', 'A4 Copier Paper 5 Ream', 'Stationery', 'pack', 1200::numeric),
      ('CHEM-ETH-1L', 'Lab Ethanol Absolute 1L', 'Chemicals', 'litre', 850::numeric)
    ) AS v(sku, name, category, unit, price)
    WHERE NOT EXISTS (
      SELECT 1 FROM fin_catalog_items c WHERE c.tenant_id = tid AND c.sku = v.sku
    );
  END IF;
END $$;

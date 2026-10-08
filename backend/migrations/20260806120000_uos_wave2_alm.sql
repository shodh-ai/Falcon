-- UOS Wave 2: ALM — Asset Lifecycle, AMC, write-off DOFA, calibration → ESM

ALTER TABLE university_assets
  ADD COLUMN IF NOT EXISTS po_id UUID REFERENCES fin_purchase_orders(po_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_id UUID,
  ADD COLUMN IF NOT EXISTS book_value NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS depreciation_method VARCHAR(30) DEFAULT 'SLM',
  ADD COLUMN IF NOT EXISTS useful_life_months INT DEFAULT 60;

ALTER TABLE university_assets DROP CONSTRAINT IF EXISTS university_assets_status_check;
ALTER TABLE university_assets
  ADD CONSTRAINT university_assets_status_check
  CHECK (status IN ('AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED', 'WRITTEN_OFF'));

CREATE TABLE IF NOT EXISTS asset_amc_contracts (
  amc_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES university_assets(asset_id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  amount_inr NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_calibration_schedules (
  calib_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES university_assets(asset_id) ON DELETE CASCADE,
  next_due_at DATE NOT NULL,
  last_calibrated_at DATE,
  esm_ticket_id UUID,
  status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_writeoff_requests (
  writeoff_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES university_assets(asset_id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(user_id),
  reason TEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING_HOD',
  hod_by UUID REFERENCES users(user_id),
  hod_at TIMESTAMPTZ,
  estate_by UUID REFERENCES users(user_id),
  estate_at TIMESTAMPTZ,
  finance_by UUID REFERENCES users(user_id),
  finance_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO roles (role_name, description)
VALUES ('ITHead', 'IT Head — asset write-off co-signer')
ON CONFLICT (role_name) DO UPDATE SET description = EXCLUDED.description;

-- Owners Portal: comparative analytics + daily financial ratios

CREATE TABLE IF NOT EXISTS owner_financial_ratios_daily (
  tenant_id uuid NOT NULL,
  ratio_date date NOT NULL,
  cac numeric NULL,
  faculty_roi numeric NULL,
  opex_ratio numeric NULL,
  fee_collection_efficiency numeric NULL,
  sources jsonb NULL,
  generated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, ratio_date)
);

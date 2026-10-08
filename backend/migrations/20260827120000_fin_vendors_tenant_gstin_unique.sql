-- Restore vendor upsert key used by procurement submit-for-approval (ON CONFLICT tenant_id + gstin)

CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_vendors_tenant_gstin
  ON fin_vendors (tenant_id, gstin);

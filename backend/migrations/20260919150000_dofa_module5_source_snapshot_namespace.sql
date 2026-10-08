-- Module 3 already owns inv_source_snapshots for invoice-integrity evidence.
-- Module 5 requires a separate append-only table for inventory-ingestion
-- snapshots; sharing the name caused production ingestion to target the Module
-- 3 schema and fail before creating inventory records.
CREATE TABLE IF NOT EXISTS inv_inventory_source_snapshots (
  source_snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT,
  source_event_id UUID NOT NULL UNIQUE,
  source_event_hash CHAR(64) NOT NULL,
  verification_record_hash CHAR(64) NOT NULL,
  evidence_manifest_hash CHAR(64) NOT NULL,
  reference_snapshot_hash CHAR(64) NOT NULL,
  source_payload JSONB NOT NULL,
  source_context JSONB NOT NULL,
  snapshot_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(inventory_record_id,snapshot_hash)
);

DROP TRIGGER IF EXISTS tr_inv_inventory_source_immutable ON inv_inventory_source_snapshots;
CREATE TRIGGER tr_inv_inventory_source_immutable
BEFORE UPDATE OR DELETE ON inv_inventory_source_snapshots
FOR EACH ROW EXECUTE FUNCTION inv_block_append_only_mutation();

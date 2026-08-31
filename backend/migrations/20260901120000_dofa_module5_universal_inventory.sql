-- DOFA Module 5: authoritative universal inventory and permanent identity

CREATE TABLE IF NOT EXISTS inv_identifier_policies (
  identifier_policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  policy_version INT NOT NULL CHECK (policy_version>0), status VARCHAR(16) NOT NULL CHECK (status IN ('DRAFT','PUBLISHED','SUPERSEDED')),
  product_pattern TEXT NOT NULL, batch_pattern TEXT NOT NULL, asset_pattern TEXT NOT NULL, rfid_pattern TEXT NOT NULL, lot_pattern TEXT NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(), effective_to TIMESTAMPTZ, published_by UUID REFERENCES users(user_id), published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(tenant_id,policy_version)
);

CREATE TABLE IF NOT EXISTS inv_category_policies (
  category_policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  category VARCHAR(120) NOT NULL DEFAULT '*', subject_type VARCHAR(8) NOT NULL CHECK(subject_type IN ('ITEM','LOT')),
  policy_version INT NOT NULL CHECK(policy_version>0), status VARCHAR(16) NOT NULL CHECK(status IN ('DRAFT','PUBLISHED','SUPERSEDED')),
  required_attributes JSONB NOT NULL DEFAULT '[]', manufacturer_serial_required BOOLEAN NOT NULL DEFAULT false,
  rfid_required BOOLEAN NOT NULL DEFAULT false, effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(), effective_to TIMESTAMPTZ,
  published_by UUID REFERENCES users(user_id), published_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,category,subject_type,policy_version)
);

CREATE TABLE IF NOT EXISTS inv_code_sequences (
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, code_type VARCHAR(16) NOT NULL,
  period_key VARCHAR(16) NOT NULL, next_value BIGINT NOT NULL DEFAULT 1 CHECK(next_value>0), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(tenant_id,code_type,period_key)
);

CREATE TABLE IF NOT EXISTS inv_product_models (
  product_model_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  product_model_code VARCHAR(100) NOT NULL, product_name VARCHAR(255) NOT NULL, category VARCHAR(120) NOT NULL,
  subcategory VARCHAR(120), brand VARCHAR(160), manufacturer VARCHAR(200), model_number VARCHAR(160), part_number VARCHAR(160),
  configuration JSONB NOT NULL DEFAULT '{}', technical_specifications JSONB NOT NULL DEFAULT '{}', normalized_fingerprint CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVIEW_REQUIRED','MERGED','INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(tenant_id,product_model_code), UNIQUE(tenant_id,normalized_fingerprint)
);

CREATE TABLE IF NOT EXISTS inv_procurement_batches (
  procurement_batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  batch_code VARCHAR(100) NOT NULL, product_model_id UUID NOT NULL REFERENCES inv_product_models(product_model_id) ON DELETE RESTRICT,
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT, acquisition_line_id UUID NOT NULL REFERENCES acq_lines(line_id) ON DELETE RESTRICT,
  order_line_id UUID NOT NULL REFERENCES proc_order_lines(order_line_id) ON DELETE RESTRICT, receipt_line_id UUID NOT NULL REFERENCES proc_receipt_lines(receipt_line_id) ON DELETE RESTRICT,
  vendor_id UUID REFERENCES fin_vendors(vendor_id) ON DELETE RESTRICT, batch_quantity NUMERIC(12,3) NOT NULL CHECK(batch_quantity>0), unit_of_measure VARCHAR(40) NOT NULL,
  previous_stock NUMERIC(15,3) NOT NULL DEFAULT 0, resulting_stock NUMERIC(15,3) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','ACTIVE','CLOSED','QUARANTINED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), activated_at TIMESTAMPTZ, UNIQUE(tenant_id,batch_code), UNIQUE(tenant_id,receipt_line_id,product_model_id)
);

CREATE TABLE IF NOT EXISTS inv_records (
  inventory_record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  subject_id UUID NOT NULL UNIQUE REFERENCES pv_subjects(subject_id) ON DELETE RESTRICT, verification_identity_id UUID NOT NULL REFERENCES pv_verification_identities(verification_identity_id) ON DELETE RESTRICT,
  product_model_id UUID NOT NULL REFERENCES inv_product_models(product_model_id) ON DELETE RESTRICT, procurement_batch_id UUID NOT NULL REFERENCES inv_procurement_batches(procurement_batch_id) ON DELETE RESTRICT,
  record_type VARCHAR(8) NOT NULL CHECK(record_type IN ('ITEM','LOT')), university_asset_id VARCHAR(120), lot_id VARCHAR(120), manufacturer_serial VARCHAR(200), normalized_manufacturer_serial VARCHAR(200),
  record_status VARCHAR(28) NOT NULL DEFAULT 'PENDING' CHECK(record_status IN ('PENDING','SOURCE_VALIDATED','IDENTITY_PENDING','ACTIVATION_PENDING','ACTIVE','ON_HOLD','QUARANTINED','REJECTED','SUPERSEDED')),
  lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE' CHECK(lifecycle_status IN ('AVAILABLE','ASSIGNED','IN_USE','MAINTENANCE','RETURNED','RETIRED','WRITTEN_OFF','DISPOSED')),
  owner_department_id INT REFERENCES departments(dept_id) ON DELETE SET NULL, custodian_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  location_space_id UUID REFERENCES campus_spaces(space_id) ON DELETE SET NULL, location_text VARCHAR(240), condition VARCHAR(32) NOT NULL DEFAULT 'GOOD',
  attributes JSONB NOT NULL DEFAULT '{}',
  category_policy_id UUID NOT NULL REFERENCES inv_category_policies(category_policy_id) ON DELETE RESTRICT, identifier_policy_id UUID NOT NULL REFERENCES inv_identifier_policies(identifier_policy_id) ON DELETE RESTRICT,
  aggregate_revision BIGINT NOT NULL DEFAULT 1 CHECK(aggregate_revision>0), next_event_sequence BIGINT NOT NULL DEFAULT 1 CHECK(next_event_sequence>0),
  activated_at TIMESTAMPTZ, quarantined_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK((record_type='ITEM' AND lot_id IS NULL) OR (record_type='LOT' AND university_asset_id IS NULL)),
  UNIQUE(tenant_id,university_asset_id), UNIQUE(tenant_id,lot_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_manufacturer_serial ON inv_records(tenant_id,normalized_manufacturer_serial) WHERE normalized_manufacturer_serial IS NOT NULL AND record_status NOT IN ('REJECTED','SUPERSEDED');

CREATE TABLE IF NOT EXISTS inv_source_snapshots (
  source_snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT, source_event_id UUID NOT NULL UNIQUE,
  source_event_hash CHAR(64) NOT NULL, verification_record_hash CHAR(64) NOT NULL, evidence_manifest_hash CHAR(64) NOT NULL, reference_snapshot_hash CHAR(64) NOT NULL,
  source_payload JSONB NOT NULL, source_context JSONB NOT NULL, snapshot_hash CHAR(64) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(inventory_record_id,snapshot_hash)
);

CREATE TABLE IF NOT EXISTS inv_asset_identities (
  asset_identity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT, university_asset_id VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PREPARED' CHECK(status IN ('PREPARED','ACTIVE','REVOKED','SUPERSEDED')),
  prepared_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT, activated_by UUID REFERENCES users(user_id), activated_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(tenant_id,university_asset_id), UNIQUE(inventory_record_id)
);

CREATE TABLE IF NOT EXISTS inv_logical_rfids (
  logical_rfid_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  inventory_record_id UUID NOT NULL UNIQUE REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT, logical_rfid_code VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'UNASSIGNED' CHECK(status IN ('UNASSIGNED','PREPARED','ENCODED','VERIFIED','ACTIVE','FAILED','LOST','REVOKED','SUPERSEDED')),
  prepared_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(tenant_id,logical_rfid_code)
);

CREATE TABLE IF NOT EXISTS inv_rfid_bindings (
  rfid_binding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  logical_rfid_id UUID NOT NULL REFERENCES inv_logical_rfids(logical_rfid_id) ON DELETE RESTRICT, physical_tag_uid VARCHAR(240) NOT NULL,
  tag_technology VARCHAR(80) NOT NULL, encoder_device_id VARCHAR(160) NOT NULL, encoded_payload_hash CHAR(64) NOT NULL, key_version VARCHAR(80),
  status VARCHAR(20) NOT NULL DEFAULT 'ENCODED' CHECK(status IN ('ENCODED','VERIFIED','ACTIVE','FAILED','LOST','REVOKED','SUPERSEDED')),
  encoded_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT, encoded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), verified_by UUID REFERENCES users(user_id), verified_at TIMESTAMPTZ,
  active_from TIMESTAMPTZ, active_to TIMESTAMPTZ, replaced_binding_id UUID REFERENCES inv_rfid_bindings(rfid_binding_id) ON DELETE RESTRICT,
  UNIQUE(tenant_id,physical_tag_uid)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_active_rfid_binding ON inv_rfid_bindings(logical_rfid_id) WHERE status='ACTIVE';

CREATE TABLE IF NOT EXISTS inv_identity_revisions (
  identity_revision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT, identity_revision BIGINT NOT NULL CHECK(identity_revision>0),
  signed_payload JSONB NOT NULL, payload_hash CHAR(64) NOT NULL, previous_revision_hash CHAR(64), signature_algorithm VARCHAR(16) NOT NULL DEFAULT 'Ed25519' CHECK(signature_algorithm='Ed25519'),
  signing_key_version VARCHAR(80) NOT NULL, signature TEXT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED','SUPERSEDED')),
  issued_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT, issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), revoked_at TIMESTAMPTZ,
  UNIQUE(inventory_record_id,identity_revision)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_active_identity_revision ON inv_identity_revisions(inventory_record_id) WHERE status='ACTIVE';

CREATE TABLE IF NOT EXISTS inv_lot_movements (
  lot_movement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), movement_group_id UUID NOT NULL, tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT, movement_type VARCHAR(24) NOT NULL CHECK(movement_type IN ('RECEIPT','ADJUSTMENT_IN','ADJUSTMENT_OUT','ISSUE','CONSUMPTION','TRANSFER_IN','TRANSFER_OUT','RETURN','WRITE_OFF')),
  quantity NUMERIC(12,3) NOT NULL CHECK(quantity>0), signed_quantity NUMERIC(12,3) NOT NULL CHECK(signed_quantity<>0), unit_of_measure VARCHAR(40) NOT NULL,
  counterparty_record_id UUID REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT, reason TEXT NOT NULL, evidence_reference TEXT,
  actor_id UUID REFERENCES users(user_id) ON DELETE RESTRICT, occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inv_state_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT, dimension VARCHAR(24) NOT NULL CHECK(dimension IN ('OWNERSHIP','CUSTODY','LOCATION','CONDITION','LIFECYCLE')),
  previous_value JSONB, new_value JSONB NOT NULL, reason TEXT NOT NULL, initiated_by UUID NOT NULL REFERENCES users(user_id), acknowledged_by UUID REFERENCES users(user_id),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPLIED','REJECTED','SUPERSEDED')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), applied_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS inv_discrepancies (
  discrepancy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  inventory_record_id UUID REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT, discrepancy_type VARCHAR(40) NOT NULL,
  description TEXT NOT NULL, reported_by UUID NOT NULL REFERENCES users(user_id), status VARCHAR(28) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','INVESTIGATING','RESOLUTION_PENDING','RESOLVED','REJECTED')),
  severity VARCHAR(20) NOT NULL DEFAULT 'REVIEWABLE' CHECK(severity IN ('REVIEWABLE','MATERIAL','NON_OVERRIDABLE')), evidence JSONB NOT NULL DEFAULT '[]', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS inv_discrepancy_resolutions (
  resolution_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), discrepancy_id UUID NOT NULL REFERENCES inv_discrepancies(discrepancy_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, resolution VARCHAR(32) NOT NULL, correction JSONB NOT NULL DEFAULT '{}', reason TEXT NOT NULL,
  resolved_by UUID NOT NULL REFERENCES users(user_id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(discrepancy_id)
);

CREATE TABLE IF NOT EXISTS inv_financial_projections (
  financial_projection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT, source_event_id UUID NOT NULL UNIQUE,
  status VARCHAR(16) NOT NULL CHECK(status IN ('ESTIMATED','PROVISIONAL','FINAL')), currency CHAR(3) NOT NULL,
  estimated_cost NUMERIC(15,2), verified_invoice_cost NUMERIC(15,2), capitalized_cost NUMERIC(15,2), adjustments NUMERIC(15,2) NOT NULL DEFAULT 0,
  funding_reference JSONB NOT NULL DEFAULT '{}', source_revision BIGINT NOT NULL, occurred_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inv_legacy_reconciliations (
  reconciliation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  legacy_source VARCHAR(40) NOT NULL, legacy_record_id UUID NOT NULL, candidate_inventory_record_id UUID REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT,
  status VARCHAR(32) NOT NULL DEFAULT 'LEGACY' CHECK(status IN ('LEGACY','RECONCILIATION_REQUIRED','RECONCILED','REJECTED_DUPLICATE')),
  evidence JSONB NOT NULL DEFAULT '{}', requested_by UUID REFERENCES users(user_id), decided_by UUID REFERENCES users(user_id), decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), decided_at TIMESTAMPTZ, UNIQUE(tenant_id,legacy_source,legacy_record_id)
);

CREATE TABLE IF NOT EXISTS inv_aliases (
  alias_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT, alias_type VARCHAR(32) NOT NULL, alias_value VARCHAR(240) NOT NULL,
  source_reconciliation_id UUID REFERENCES inv_legacy_reconciliations(reconciliation_id) ON DELETE RESTRICT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(tenant_id,alias_type,alias_value)
);

CREATE TABLE IF NOT EXISTS inv_audit_events (
  audit_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  inventory_record_id UUID REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT, entity_type VARCHAR(40) NOT NULL, entity_id UUID NOT NULL,
  event_type VARCHAR(80) NOT NULL, actor_id UUID REFERENCES users(user_id), previous_value JSONB, new_value JSONB, reason TEXT,
  previous_hash CHAR(64), event_hash CHAR(64) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inv_outbox_events (
  event_id UUID PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, inventory_record_id UUID REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT,
  subject_id UUID REFERENCES pv_subjects(subject_id) ON DELETE RESTRICT, aggregate_id UUID NOT NULL, aggregate_revision BIGINT NOT NULL, aggregate_sequence BIGINT NOT NULL,
  event_type VARCHAR(96) NOT NULL, event_version INT NOT NULL DEFAULT 1, occurred_at TIMESTAMPTZ NOT NULL, payload JSONB NOT NULL, payload_hash CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','PUBLISHED','FAILED')), attempts INT NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), published_at TIMESTAMPTZ, last_error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(aggregate_id,aggregate_sequence)
);

CREATE TABLE IF NOT EXISTS inv_consumed_events (
  event_id UUID PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, event_type VARCHAR(96) NOT NULL,
  inventory_record_id UUID REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT, consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS proc_inventory_event_consumption (
  event_id UUID PRIMARY KEY REFERENCES inv_outbox_events(event_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  proc_case_line_id UUID NOT NULL REFERENCES proc_case_lines(proc_case_line_id) ON DELETE RESTRICT,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS pv_inventory_event_consumption (
  event_id UUID PRIMARY KEY REFERENCES inv_outbox_events(event_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES pv_subjects(subject_id) ON DELETE RESTRICT,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS inv_idempotency (
  idempotency_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  actor_id VARCHAR(160) NOT NULL, idempotency_key VARCHAR(160) NOT NULL, request_hash CHAR(64) NOT NULL, response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '24 hours', UNIQUE(tenant_id,actor_id,idempotency_key)
);

ALTER TABLE university_assets ADD COLUMN IF NOT EXISTS module5_source_id UUID REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT, ADD COLUMN IF NOT EXISTS module5_managed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS module5_source_id UUID REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT, ADD COLUMN IF NOT EXISTS module5_managed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE lab_equipment ADD COLUMN IF NOT EXISTS module5_source_id UUID REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT, ADD COLUMN IF NOT EXISTS module5_managed BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION inv_block_append_only_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'INVENTORY_IMMUTABLE: append-only record cannot be changed'; END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION inv_protect_identity_revision() RETURNS trigger AS $$ BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id OR OLD.inventory_record_id IS DISTINCT FROM NEW.inventory_record_id
     OR OLD.identity_revision IS DISTINCT FROM NEW.identity_revision OR OLD.signed_payload IS DISTINCT FROM NEW.signed_payload
     OR OLD.payload_hash IS DISTINCT FROM NEW.payload_hash OR OLD.previous_revision_hash IS DISTINCT FROM NEW.previous_revision_hash
     OR OLD.signature_algorithm IS DISTINCT FROM NEW.signature_algorithm OR OLD.signing_key_version IS DISTINCT FROM NEW.signing_key_version
     OR OLD.signature IS DISTINCT FROM NEW.signature OR OLD.issued_by IS DISTINCT FROM NEW.issued_by OR OLD.issued_at IS DISTINCT FROM NEW.issued_at
  THEN RAISE EXCEPTION 'INVENTORY_IMMUTABLE: signed identity payload cannot be changed'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER tr_inv_source_immutable BEFORE UPDATE OR DELETE ON inv_source_snapshots FOR EACH ROW EXECUTE FUNCTION inv_block_append_only_mutation();
CREATE TRIGGER tr_inv_identity_revision_immutable BEFORE UPDATE ON inv_identity_revisions FOR EACH ROW EXECUTE FUNCTION inv_protect_identity_revision();
CREATE TRIGGER tr_inv_identity_revision_no_delete BEFORE DELETE ON inv_identity_revisions FOR EACH ROW EXECUTE FUNCTION inv_block_append_only_mutation();
CREATE TRIGGER tr_inv_lot_movement_immutable BEFORE UPDATE OR DELETE ON inv_lot_movements FOR EACH ROW EXECUTE FUNCTION inv_block_append_only_mutation();
CREATE TRIGGER tr_inv_discrepancy_resolution_immutable BEFORE UPDATE OR DELETE ON inv_discrepancy_resolutions FOR EACH ROW EXECUTE FUNCTION inv_block_append_only_mutation();
CREATE TRIGGER tr_inv_financial_immutable BEFORE UPDATE OR DELETE ON inv_financial_projections FOR EACH ROW EXECUTE FUNCTION inv_block_append_only_mutation();
CREATE TRIGGER tr_inv_audit_immutable BEFORE UPDATE OR DELETE ON inv_audit_events FOR EACH ROW EXECUTE FUNCTION inv_block_append_only_mutation();

CREATE INDEX IF NOT EXISTS idx_inv_records_scope ON inv_records(tenant_id,owner_department_id,record_status,lifecycle_status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_models_search ON inv_product_models(tenant_id,category,brand,model_number);
CREATE INDEX IF NOT EXISTS idx_inv_batches_receipt ON inv_procurement_batches(tenant_id,receipt_line_id);
CREATE INDEX IF NOT EXISTS idx_inv_lot_ledger ON inv_lot_movements(inventory_record_id,occurred_at,lot_movement_id);
CREATE INDEX IF NOT EXISTS idx_inv_outbox_pending ON inv_outbox_events(status,available_at) WHERE status IN ('PENDING','FAILED');

DO $$ DECLARE t RECORD; BEGIN FOR t IN SELECT tenant_id,COALESCE(NULLIF(regexp_replace(lower(name),'[^a-z0-9]','','g'),''),'tenant') AS slug FROM tenants LOOP
  INSERT INTO inv_identifier_policies(tenant_id,policy_version,status,product_pattern,batch_pattern,asset_pattern,rfid_pattern,lot_pattern,published_at)
  VALUES(t.tenant_id,1,'PUBLISHED','PRD-{tenant}-{seq6}','BAT-{tenant}-{yyyymm}-{seq6}','AST-{tenant}-{yyyy}-{seq6}','RFI-{tenant}-{yyyy}-{seq6}','LOT-{tenant}-{yyyy}-{seq6}',NOW()) ON CONFLICT DO NOTHING;
  INSERT INTO inv_category_policies(tenant_id,category,subject_type,policy_version,status,required_attributes,manufacturer_serial_required,rfid_required,published_at)
  VALUES(t.tenant_id,'*','ITEM',1,'PUBLISHED','[]',false,false,NOW()),(t.tenant_id,'*','LOT',1,'PUBLISHED','[]',false,false,NOW()) ON CONFLICT DO NOTHING;
  INSERT INTO acq_access_grants(tenant_id,principal_role,capability,scope_type)
  SELECT t.tenant_id,x.role_name,x.capability,'TENANT' FROM (VALUES
    ('Stores','INVENTORY_VIEW'),('Stores','INVENTORY_INGEST'),('Stores','INVENTORY_IDENTITY_PREPARE'),('Stores','INVENTORY_RFID_ENCODE'),('Stores','INVENTORY_ASSIGN'),('Stores','INVENTORY_LOT_MOVEMENT'),('Stores','INVENTORY_DISCREPANCY_REPORT'),
    ('ReceivingClerk','INVENTORY_VIEW'),('ReceivingClerk','INVENTORY_INGEST'),('InventoryVerifier','INVENTORY_VIEW'),('InventoryVerifier','INVENTORY_IDENTITY_VERIFY'),
    ('ProcurementHead','INVENTORY_VIEW'),('ProcurementHead','INVENTORY_TRANSFER'),('ProcurementHead','INVENTORY_DISCREPANCY_RESOLVE'),
    ('InternalAuditor','INVENTORY_VIEW'),('InternalAuditor','INVENTORY_FINANCIAL_VIEW'),('InternalAuditor','INVENTORY_AUDIT'),
    ('SuperAdmin','INVENTORY_VIEW'),('SuperAdmin','INVENTORY_FINANCIAL_VIEW'),('SuperAdmin','INVENTORY_INGEST'),('SuperAdmin','INVENTORY_IDENTITY_PREPARE'),('SuperAdmin','INVENTORY_RFID_ENCODE'),('SuperAdmin','INVENTORY_IDENTITY_VERIFY'),('SuperAdmin','INVENTORY_ASSIGN'),('SuperAdmin','INVENTORY_TRANSFER'),('SuperAdmin','INVENTORY_LOT_MOVEMENT'),('SuperAdmin','INVENTORY_DISCREPANCY_REPORT'),('SuperAdmin','INVENTORY_DISCREPANCY_RESOLVE'),('SuperAdmin','INVENTORY_POLICY_ADMIN'),('SuperAdmin','INVENTORY_AUDIT'),('SuperAdmin','INVENTORY_LEGACY_RECONCILE')
  ) x(role_name,capability) WHERE NOT EXISTS(SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=t.tenant_id AND g.principal_role=x.role_name AND g.capability=x.capability AND g.scope_type='TENANT');
END LOOP; END $$;

INSERT INTO roles(role_name,description) VALUES('InventoryVerifier','Independent inventory identity and RFID verifier') ON CONFLICT(role_name) DO NOTHING;
INSERT INTO tenant_subscriptions(tenant_id,feature_key,is_enabled) SELECT tenant_id,'dofa_module5_inventory',false FROM tenants ON CONFLICT DO NOTHING;
INSERT INTO tenant_subscriptions(tenant_id,feature_key,is_enabled) SELECT tenant_id,'dofa_module5_identity_gate',false FROM tenants ON CONFLICT DO NOTHING;

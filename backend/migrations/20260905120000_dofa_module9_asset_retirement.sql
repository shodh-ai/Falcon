-- DoFA Module 9: canonical asset retirement, write-off orchestration and disposition

CREATE TABLE IF NOT EXISTS retirement_policies (
  retirement_policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  category VARCHAR(120) NOT NULL DEFAULT '*', product_model_id UUID REFERENCES inv_product_models(product_model_id) ON DELETE RESTRICT,
  disposition_method VARCHAR(40), policy_version INT NOT NULL CHECK(policy_version>0), status VARCHAR(16) NOT NULL CHECK(status IN('DRAFT','PUBLISHED','SUPERSEDED')),
  assessment_requirements JSONB NOT NULL DEFAULT '[]', appraisal_required BOOLEAN NOT NULL DEFAULT true,
  data_bearing BOOLEAN NOT NULL DEFAULT false, sanitization_method VARCHAR(40), environmental_requirements JSONB NOT NULL DEFAULT '[]',
  provider_license_requirements JSONB NOT NULL DEFAULT '[]', witness_count INT NOT NULL DEFAULT 1 CHECK(witness_count>=1),
  reserve_tolerance_pct NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK(reserve_tolerance_pct>=0), finance_receipt_before_handover BOOLEAN NOT NULL DEFAULT true,
  certificate_retention_years INT NOT NULL DEFAULT 10 CHECK(certificate_retention_years>0), effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(), effective_to TIMESTAMPTZ,
  published_by UUID REFERENCES users(user_id), published_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,category,product_model_id,disposition_method,policy_version)
);

CREATE TABLE IF NOT EXISTS retirement_cases (
  retirement_case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  case_number VARCHAR(100) NOT NULL, workflow_status VARCHAR(32) NOT NULL DEFAULT 'DRAFT'
    CHECK(workflow_status IN('DRAFT','SUBMITTED','ASSESSMENT','PENDING_DOFA','APPROVED','PREPARATION','IN_EXECUTION','COMPLETION_PENDING','CLOSED','REJECTED','CANCELLED','ON_HOLD','DISPUTED','SUPERSEDED')),
  physical_status VARCHAR(32) NOT NULL DEFAULT 'PENDING'
    CHECK(physical_status IN('PENDING','RETIRE_APPROVED','RETIRED_IN_CUSTODY','HANDED_OVER','PHYSICAL_COMPLETED','DISPOSED')),
  finance_status VARCHAR(32) NOT NULL DEFAULT 'SNAPSHOT_PENDING'
    CHECK(finance_status IN('SNAPSHOT_PENDING','READY_FOR_POSTING','FINANCE_PENDING','FINANCE_POSTING_FAILED','WRITE_OFF_POSTED','PROCEEDS_PENDING','SETTLED','NOT_APPLICABLE')),
  sanitization_status VARCHAR(40) NOT NULL DEFAULT 'NOT_ASSESSED'
    CHECK(sanitization_status IN('NOT_ASSESSED','NOT_REQUIRED','REQUIRED','IN_PROGRESS','VERIFIED','FAILED','PHYSICAL_DESTRUCTION_REQUIRED')),
  disposition_method VARCHAR(40) CHECK(disposition_method IS NULL OR disposition_method IN('AUCTION_SALE','DIRECT_SALE','CERTIFIED_E_WASTE','CERTIFIED_RECYCLING','SCRAP','DONATION','RETURN_TO_VENDOR_TAKEBACK','TRANSFER_TO_INSTITUTION','CERTIFIED_DESTRUCTION')),
  title VARCHAR(240) NOT NULL, retirement_reason TEXT NOT NULL, requested_by UUID NOT NULL REFERENCES users(user_id), owner_department_id INT REFERENCES departments(dept_id),
  source_service_case_id UUID REFERENCES svc_cases(service_case_id) ON DELETE RESTRICT, root_retirement_case_id UUID REFERENCES retirement_cases(retirement_case_id) ON DELETE RESTRICT,
  supersedes_retirement_case_id UUID REFERENCES retirement_cases(retirement_case_id) ON DELETE RESTRICT, supersede_reason TEXT,
  dofa_case_id UUID REFERENCES dofa_cases(case_id) ON DELETE RESTRICT, dofa_decision_status VARCHAR(20), approval_basis_amount NUMERIC(15,2), currency CHAR(3) NOT NULL DEFAULT 'INR',
  retirement_policy_id UUID REFERENCES retirement_policies(retirement_policy_id) ON DELETE RESTRICT, approved_at TIMESTAMPTZ, physical_completed_at TIMESTAMPTZ,
  finance_completed_at TIMESTAMPTZ, closed_at TIMESTAMPTZ, aggregate_revision BIGINT NOT NULL DEFAULT 1 CHECK(aggregate_revision>0),
  next_event_sequence BIGINT NOT NULL DEFAULT 1 CHECK(next_event_sequence>0), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,case_number), CHECK((workflow_status='CLOSED' AND physical_status='DISPOSED' AND finance_status IN('SETTLED','NOT_APPLICABLE') AND closed_at IS NOT NULL) OR workflow_status<>'CLOSED')
);

CREATE TABLE IF NOT EXISTS retirement_allocations (
  retirement_allocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  retirement_case_id UUID NOT NULL REFERENCES retirement_cases(retirement_case_id) ON DELETE RESTRICT,
  inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT,
  parent_inventory_record_id UUID REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT,
  allocation_type VARCHAR(16) NOT NULL DEFAULT 'ASSET' CHECK(allocation_type IN('ASSET','COMPONENT')),
  inventory_revision BIGINT NOT NULL, identity_revision BIGINT, status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','HELD','APPROVED','IN_EXECUTION','DISPOSED','RELEASED','SUPERSEDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(retirement_case_id,inventory_record_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_retirement_active_allocation ON retirement_allocations(inventory_record_id)
  WHERE status IN('HELD','APPROVED','IN_EXECUTION');

CREATE TABLE IF NOT EXISTS retirement_holds (
  retirement_hold_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  retirement_case_id UUID NOT NULL REFERENCES retirement_cases(retirement_case_id) ON DELETE RESTRICT,
  inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','RELEASED','SUPERSEDED')),
  previous_record_status VARCHAR(28) NOT NULL, previous_lifecycle_status VARCHAR(20) NOT NULL, hold_reason TEXT NOT NULL,
  placed_by UUID NOT NULL REFERENCES users(user_id), placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), released_by UUID REFERENCES users(user_id), released_at TIMESTAMPTZ, release_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_retirement_active_hold ON retirement_holds(inventory_record_id) WHERE status='ACTIVE';

CREATE TABLE IF NOT EXISTS retirement_assessments (
  retirement_assessment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  retirement_case_id UUID NOT NULL REFERENCES retirement_cases(retirement_case_id) ON DELETE RESTRICT, revision INT NOT NULL CHECK(revision>0),
  technical_condition JSONB NOT NULL, service_history JSONB NOT NULL DEFAULT '{}', age_and_useful_life JSONB NOT NULL,
  redeployment_assessment JSONB NOT NULL, component_recovery JSONB NOT NULL DEFAULT '[]', legal_holds JSONB NOT NULL DEFAULT '[]',
  environmental_classification JSONB NOT NULL, data_classification JSONB NOT NULL, recommended_disposition VARCHAR(40) NOT NULL,
  estimated_disposal_cost NUMERIC(15,2) NOT NULL DEFAULT 0, expected_proceeds NUMERIC(15,2) NOT NULL DEFAULT 0, reserve_price NUMERIC(15,2), currency CHAR(3) NOT NULL,
  assessed_by UUID NOT NULL REFERENCES users(user_id), snapshot_hash CHAR(64) NOT NULL UNIQUE, assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(retirement_case_id,revision)
);

CREATE TABLE IF NOT EXISTS retirement_financial_snapshots (
  financial_snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  retirement_case_id UUID NOT NULL REFERENCES retirement_cases(retirement_case_id) ON DELETE RESTRICT, source_system VARCHAR(40) NOT NULL DEFAULT 'FINANCE_GL',
  capitalized_cost NUMERIC(15,2) NOT NULL, accumulated_depreciation NUMERIC(15,2) NOT NULL DEFAULT 0, impairment NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_book_value NUMERIC(15,2) NOT NULL, salvage_value NUMERIC(15,2) NOT NULL DEFAULT 0, currency CHAR(3) NOT NULL,
  fiscal_period VARCHAR(40), funding_restrictions JSONB NOT NULL DEFAULT '{}', source_reference JSONB NOT NULL, source_revision BIGINT NOT NULL,
  snapshot_hash CHAR(64) NOT NULL UNIQUE, captured_by UUID NOT NULL REFERENCES users(user_id), captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retirement_approval_snapshots (
  approval_snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  retirement_case_id UUID NOT NULL REFERENCES retirement_cases(retirement_case_id) ON DELETE RESTRICT, dofa_case_id UUID NOT NULL REFERENCES dofa_cases(case_id) ON DELETE RESTRICT,
  allocation_manifest JSONB NOT NULL, technical_snapshot JSONB NOT NULL, financial_snapshot JSONB NOT NULL, disposition_snapshot JSONB NOT NULL,
  sanitization_snapshot JSONB NOT NULL, environmental_snapshot JSONB NOT NULL, policy_versions JSONB NOT NULL, resolved_route JSONB NOT NULL,
  approval_basis_amount NUMERIC(15,2) NOT NULL, snapshot_hash CHAR(64) NOT NULL UNIQUE, submitted_by UUID NOT NULL REFERENCES users(user_id), submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(retirement_case_id,dofa_case_id)
);

CREATE TABLE IF NOT EXISTS retirement_sanitization_jobs (
  sanitization_job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  retirement_case_id UUID NOT NULL REFERENCES retirement_cases(retirement_case_id) ON DELETE RESTRICT, inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT,
  method VARCHAR(40) NOT NULL CHECK(method IN('LOGICAL_WIPE','CRYPTOGRAPHIC_ERASE','FACTORY_RESET','MEDIA_DEGAUSS','MEDIA_PHYSICAL_DESTRUCTION','VENDOR_CERTIFIED_SANITIZATION')),
  media_manifest JSONB NOT NULL, tool_and_standard JSONB NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'REQUIRED' CHECK(status IN('REQUIRED','IN_PROGRESS','VERIFIED','FAILED','PHYSICAL_DESTRUCTION_REQUIRED')),
  result JSONB, evidence_manifest_hash CHAR(64), operated_by UUID REFERENCES users(user_id), verified_by UUID REFERENCES users(user_id),
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, verified_at TIMESTAMPTZ, CHECK(verified_by IS NULL OR verified_by<>operated_by), UNIQUE(retirement_case_id,inventory_record_id)
);

CREATE TABLE IF NOT EXISTS retirement_providers (
  retirement_provider_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  provider_type VARCHAR(24) NOT NULL CHECK(provider_type IN('E_WASTE','RECYCLER','SCRAP','DESTRUCTION','TRANSPORT','TAKEBACK')),
  display_name VARCHAR(240) NOT NULL, vendor_id UUID REFERENCES fin_vendors(vendor_id) ON DELETE RESTRICT, approved_categories JSONB NOT NULL DEFAULT '[]',
  license_manifest JSONB NOT NULL, environmental_authorizations JSONB NOT NULL DEFAULT '[]', valid_from DATE NOT NULL, valid_to DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','SUSPENDED','EXPIRED','REVOKED')), created_by UUID NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(tenant_id,display_name)
);

CREATE TABLE IF NOT EXISTS retirement_parties (
  retirement_party_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  party_type VARCHAR(20) NOT NULL CHECK(party_type IN('BIDDER','BUYER','INSTITUTION','DONATION_RECIPIENT')),
  display_name VARCHAR(240) NOT NULL, registration_reference VARCHAR(200), contact_reference JSONB NOT NULL DEFAULT '{}', compliance_evidence JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','SUSPENDED','REVOKED')), created_by UUID NOT NULL REFERENCES users(user_id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retirement_disposal_lots (
  disposal_lot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  retirement_case_id UUID NOT NULL REFERENCES retirement_cases(retirement_case_id) ON DELETE RESTRICT, lot_code VARCHAR(100) NOT NULL,
  disposition_method VARCHAR(40) NOT NULL, status VARCHAR(24) NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','LOCKED','BIDDING','AWARDED','IN_HANDOVER','PHYSICAL_COMPLETED','CANCELLED','SUPERSEDED')),
  reserve_price NUMERIC(15,2), currency CHAR(3) NOT NULL, bidding_opens_at TIMESTAMPTZ, bidding_closes_at TIMESTAMPTZ,
  manifest_hash CHAR(64), locked_by UUID REFERENCES users(user_id), locked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(tenant_id,lot_code)
);
CREATE TABLE IF NOT EXISTS retirement_disposal_lot_assets (
  disposal_lot_id UUID NOT NULL REFERENCES retirement_disposal_lots(disposal_lot_id) ON DELETE RESTRICT,
  retirement_allocation_id UUID NOT NULL REFERENCES retirement_allocations(retirement_allocation_id) ON DELETE RESTRICT,
  inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT,
  PRIMARY KEY(disposal_lot_id,inventory_record_id), UNIQUE(retirement_allocation_id)
);

CREATE TABLE IF NOT EXISTS retirement_offers (
  retirement_offer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  disposal_lot_id UUID NOT NULL REFERENCES retirement_disposal_lots(disposal_lot_id) ON DELETE RESTRICT, retirement_party_id UUID NOT NULL REFERENCES retirement_parties(retirement_party_id) ON DELETE RESTRICT,
  encrypted_offer TEXT NOT NULL, offer_hash CHAR(64) NOT NULL, amount NUMERIC(15,2), currency CHAR(3), taxes_fees JSONB,
  conflict_declaration JSONB NOT NULL, submitted_by UUID NOT NULL REFERENCES users(user_id), submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_by JSONB, opened_at TIMESTAMPTZ, withdrawn_at TIMESTAMPTZ, status VARCHAR(20) NOT NULL DEFAULT 'SEALED' CHECK(status IN('SEALED','OPENED','WITHDRAWN','REJECTED','AWARDED')),
  UNIQUE(disposal_lot_id,retirement_party_id)
);

CREATE TABLE IF NOT EXISTS retirement_awards (
  retirement_award_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  disposal_lot_id UUID NOT NULL UNIQUE REFERENCES retirement_disposal_lots(disposal_lot_id) ON DELETE RESTRICT,
  retirement_offer_id UUID REFERENCES retirement_offers(retirement_offer_id) ON DELETE RESTRICT, retirement_party_id UUID REFERENCES retirement_parties(retirement_party_id) ON DELETE RESTRICT,
  retirement_provider_id UUID REFERENCES retirement_providers(retirement_provider_id) ON DELETE RESTRICT, award_amount NUMERIC(15,2), currency CHAR(3),
  evaluation JSONB NOT NULL, within_approval_envelope BOOLEAN NOT NULL, amendment_dofa_case_id UUID REFERENCES dofa_cases(case_id),
  approved_by UUID NOT NULL REFERENCES users(user_id), decision_hash CHAR(64) NOT NULL UNIQUE, awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retirement_custody_events (
  custody_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  retirement_case_id UUID NOT NULL REFERENCES retirement_cases(retirement_case_id) ON DELETE RESTRICT, disposal_lot_id UUID REFERENCES retirement_disposal_lots(disposal_lot_id),
  event_type VARCHAR(32) NOT NULL CHECK(event_type IN('DISPATCHED','PARTIAL_PICKUP','HANDED_OVER','RECIPIENT_ACCEPTED','RECYCLED','DESTROYED','TAKEN_BACK')),
  inventory_manifest JSONB NOT NULL, source_custody JSONB NOT NULL, destination_custody JSONB NOT NULL, transport_reference JSONB NOT NULL DEFAULT '{}',
  evidence_manifest_hash CHAR(64) NOT NULL, executed_by UUID NOT NULL REFERENCES users(user_id), witnessed_by UUID NOT NULL REFERENCES users(user_id),
  recipient_reference JSONB NOT NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK(executed_by<>witnessed_by)
);

CREATE TABLE IF NOT EXISTS retirement_finance_projections (
  finance_projection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  retirement_case_id UUID NOT NULL REFERENCES retirement_cases(retirement_case_id) ON DELETE RESTRICT, source_event_id UUID UNIQUE,
  projection_type VARCHAR(32) NOT NULL CHECK(projection_type IN('WRITE_OFF','PROCEEDS','TAX','FEE','DISPOSAL_COST','TRANSPORT_COST','GAIN_LOSS','GRANT_TREATMENT')),
  posting_status VARCHAR(24) NOT NULL CHECK(posting_status IN('REQUESTED','POSTED','FAILED','REVERSED')), amount NUMERIC(15,2) NOT NULL DEFAULT 0, currency CHAR(3) NOT NULL,
  source_reference JSONB NOT NULL, failure_reason TEXT, source_revision BIGINT NOT NULL, occurred_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retirement_evidence (
  evidence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  retirement_case_id UUID NOT NULL REFERENCES retirement_cases(retirement_case_id) ON DELETE RESTRICT, evidence_type VARCHAR(48) NOT NULL,
  object_key TEXT NOT NULL, content_hash CHAR(64) NOT NULL, mime_type VARCHAR(120) NOT NULL, byte_size BIGINT NOT NULL CHECK(byte_size>0),
  metadata JSONB NOT NULL DEFAULT '{}', retention_class VARCHAR(32) NOT NULL DEFAULT 'ASSET_RETIREMENT', captured_by UUID NOT NULL REFERENCES users(user_id),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), revision_of UUID REFERENCES retirement_evidence(evidence_id), UNIQUE(tenant_id,retirement_case_id,content_hash)
);

CREATE TABLE IF NOT EXISTS retirement_certificates (
  retirement_certificate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  retirement_case_id UUID NOT NULL REFERENCES retirement_cases(retirement_case_id) ON DELETE RESTRICT, certificate_revision INT NOT NULL CHECK(certificate_revision>0),
  certificate_code VARCHAR(140) NOT NULL, signed_payload JSONB NOT NULL, payload_hash CHAR(64) NOT NULL, evidence_manifest_hash CHAR(64) NOT NULL,
  previous_certificate_hash CHAR(64), signature_algorithm VARCHAR(16) NOT NULL DEFAULT 'Ed25519' CHECK(signature_algorithm='Ed25519'), signing_key_version VARCHAR(80) NOT NULL,
  signature TEXT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','REVOKED','SUPERSEDED')),
  issued_by UUID NOT NULL REFERENCES users(user_id), issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), revoked_at TIMESTAMPTZ,
  UNIQUE(tenant_id,certificate_code), UNIQUE(retirement_case_id,certificate_revision)
);

CREATE TABLE IF NOT EXISTS retirement_idempotency (
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, actor_id UUID NOT NULL REFERENCES users(user_id), idempotency_key VARCHAR(160) NOT NULL,
  request_hash CHAR(64) NOT NULL, response_payload JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(tenant_id,actor_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS retirement_audit_events (
  audit_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  retirement_case_id UUID NOT NULL REFERENCES retirement_cases(retirement_case_id) ON DELETE RESTRICT, entity_type VARCHAR(40) NOT NULL, entity_id UUID NOT NULL,
  event_type VARCHAR(104) NOT NULL, actor_id UUID REFERENCES users(user_id), previous_value JSONB, new_value JSONB, previous_hash CHAR(64), event_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS retirement_outbox_events (
  event_id UUID PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, aggregate_id UUID NOT NULL REFERENCES retirement_cases(retirement_case_id) ON DELETE RESTRICT,
  aggregate_revision BIGINT NOT NULL, aggregate_sequence BIGINT NOT NULL, event_type VARCHAR(112) NOT NULL, event_version INT NOT NULL DEFAULT 1,
  occurred_at TIMESTAMPTZ NOT NULL, payload JSONB NOT NULL, payload_hash CHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','PROCESSING','PUBLISHED','FAILED')), attempts INT NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_error TEXT, published_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(aggregate_id,aggregate_sequence)
);
CREATE TABLE IF NOT EXISTS retirement_consumed_events (
  event_id UUID PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, event_type VARCHAR(112) NOT NULL, consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE asset_writeoff_requests ADD COLUMN IF NOT EXISTS module9_retirement_case_id UUID REFERENCES retirement_cases(retirement_case_id) ON DELETE RESTRICT;
ALTER TABLE asset_writeoff_requests ADD COLUMN IF NOT EXISTS module9_managed BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_writeoff_module9_asset ON asset_writeoff_requests(module9_retirement_case_id,asset_id) WHERE module9_retirement_case_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_dofa_module9_source ON dofa_cases(tenant_id,domain,source_table,source_id)
  WHERE domain='ASSET_WRITEOFF' AND source_table='retirement_cases';

CREATE OR REPLACE FUNCTION retirement_immutable_record() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'ASSET_RETIREMENT_IMMUTABLE'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER tr_retirement_assessment_immutable BEFORE UPDATE OR DELETE ON retirement_assessments FOR EACH ROW EXECUTE FUNCTION retirement_immutable_record();
CREATE TRIGGER tr_retirement_financial_snapshot_immutable BEFORE UPDATE OR DELETE ON retirement_financial_snapshots FOR EACH ROW EXECUTE FUNCTION retirement_immutable_record();
CREATE TRIGGER tr_retirement_approval_snapshot_immutable BEFORE UPDATE OR DELETE ON retirement_approval_snapshots FOR EACH ROW EXECUTE FUNCTION retirement_immutable_record();
CREATE TRIGGER tr_retirement_award_immutable BEFORE UPDATE OR DELETE ON retirement_awards FOR EACH ROW EXECUTE FUNCTION retirement_immutable_record();
CREATE TRIGGER tr_retirement_custody_immutable BEFORE UPDATE OR DELETE ON retirement_custody_events FOR EACH ROW EXECUTE FUNCTION retirement_immutable_record();
CREATE TRIGGER tr_retirement_evidence_immutable BEFORE UPDATE OR DELETE ON retirement_evidence FOR EACH ROW EXECUTE FUNCTION retirement_immutable_record();
CREATE TRIGGER tr_retirement_audit_immutable BEFORE UPDATE OR DELETE ON retirement_audit_events FOR EACH ROW EXECUTE FUNCTION retirement_immutable_record();

CREATE OR REPLACE FUNCTION retirement_closed_case_immutable() RETURNS trigger AS $$
BEGIN IF OLD.workflow_status='CLOSED' THEN RAISE EXCEPTION 'ASSET_RETIREMENT_CLOSED_IMMUTABLE'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER tr_retirement_closed_case_immutable BEFORE UPDATE OR DELETE ON retirement_cases FOR EACH ROW EXECUTE FUNCTION retirement_closed_case_immutable();

-- Cross-module retirement hold guard. Only a transaction-local context set by the
-- canonical Module 9 service can mutate protected records while a hold is active.
CREATE OR REPLACE FUNCTION retirement_guard_protected_mutation() RETURNS trigger AS $$
DECLARE rid UUID; held_case UUID; authorized_case TEXT; authorized_action TEXT;
BEGIN
  IF TG_TABLE_NAME='inv_records' THEN rid:=COALESCE(NEW.inventory_record_id,OLD.inventory_record_id);
  ELSIF TG_TABLE_NAME='ret_case_allocations' THEN rid:=COALESCE(NEW.inventory_record_id,OLD.inventory_record_id);
  ELSIF TG_TABLE_NAME='svc_asset_holds' THEN rid:=COALESCE(NEW.inventory_record_id,OLD.inventory_record_id);
  ELSIF TG_TABLE_NAME='university_assets' THEN rid:=COALESCE(NEW.module5_source_id,OLD.module5_source_id);
  ELSIF TG_TABLE_NAME='inv_rfid_bindings' THEN
    SELECT inventory_record_id INTO rid FROM inv_logical_rfids WHERE logical_rfid_id=COALESCE(NEW.logical_rfid_id,OLD.logical_rfid_id);
  ELSIF TG_TABLE_NAME='inv_logical_rfids' THEN rid:=COALESCE(NEW.inventory_record_id,OLD.inventory_record_id);
  ELSIF TG_TABLE_NAME='inv_asset_identities' THEN rid:=COALESCE(NEW.inventory_record_id,OLD.inventory_record_id);
  ELSIF TG_TABLE_NAME='inv_identity_revisions' THEN rid:=COALESCE(NEW.inventory_record_id,OLD.inventory_record_id);
  END IF;
  IF rid IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  SELECT retirement_case_id INTO held_case FROM retirement_holds WHERE inventory_record_id=rid AND status='ACTIVE';
  IF held_case IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  authorized_case:=current_setting('falcon.module9_case_id',true); authorized_action:=current_setting('falcon.module9_action',true);
  IF authorized_case IS DISTINCT FROM held_case::text OR COALESCE(authorized_action,'')='' THEN
    RAISE EXCEPTION 'ASSET_RETIREMENT_HOLD_ACTIVE:%',held_case USING ERRCODE='55000';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER tr_retirement_guard_inventory BEFORE UPDATE OR DELETE ON inv_records FOR EACH ROW EXECUTE FUNCTION retirement_guard_protected_mutation();
CREATE TRIGGER tr_retirement_guard_returns BEFORE INSERT OR UPDATE OR DELETE ON ret_case_allocations FOR EACH ROW EXECUTE FUNCTION retirement_guard_protected_mutation();
CREATE TRIGGER tr_retirement_guard_service BEFORE INSERT OR UPDATE OR DELETE ON svc_asset_holds FOR EACH ROW EXECUTE FUNCTION retirement_guard_protected_mutation();
CREATE TRIGGER tr_retirement_guard_rfid BEFORE INSERT OR UPDATE OR DELETE ON inv_rfid_bindings FOR EACH ROW EXECUTE FUNCTION retirement_guard_protected_mutation();
CREATE TRIGGER tr_retirement_guard_logical_rfid BEFORE INSERT OR UPDATE OR DELETE ON inv_logical_rfids FOR EACH ROW EXECUTE FUNCTION retirement_guard_protected_mutation();
CREATE TRIGGER tr_retirement_guard_asset_identity BEFORE INSERT OR UPDATE OR DELETE ON inv_asset_identities FOR EACH ROW EXECUTE FUNCTION retirement_guard_protected_mutation();
CREATE TRIGGER tr_retirement_guard_identity_revision BEFORE INSERT OR UPDATE OR DELETE ON inv_identity_revisions FOR EACH ROW EXECUTE FUNCTION retirement_guard_protected_mutation();
CREATE TRIGGER tr_retirement_guard_legacy_asset BEFORE UPDATE OR DELETE ON university_assets FOR EACH ROW EXECUTE FUNCTION retirement_guard_protected_mutation();

CREATE INDEX IF NOT EXISTS idx_retirement_case_queue ON retirement_cases(tenant_id,workflow_status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_retirement_hold_asset ON retirement_holds(inventory_record_id,status);
CREATE INDEX IF NOT EXISTS idx_retirement_finance_queue ON retirement_cases(tenant_id,finance_status,updated_at DESC);

DO $$ DECLARE t RECORD; BEGIN FOR t IN SELECT tenant_id FROM tenants LOOP
  INSERT INTO acq_access_grants(tenant_id,principal_role,capability,scope_type)
  SELECT t.tenant_id,x.role_name,x.capability,'TENANT' FROM(VALUES
    ('Faculty','ASSET_RETIREMENT_VIEW'),('Faculty','ASSET_RETIREMENT_REQUEST'),('LabAdmin','ASSET_RETIREMENT_VIEW'),('LabAdmin','ASSET_RETIREMENT_REQUEST'),
    ('Stores','ASSET_RETIREMENT_VIEW'),('Stores','ASSET_DISPOSAL_PREPARE'),('Stores','ASSET_DISPOSAL_EXECUTE'),
    ('ProcurementHead','ASSET_RETIREMENT_VIEW'),('ProcurementHead','ASSET_RETIREMENT_ASSESS'),('ProcurementHead','ASSET_RETIREMENT_DOFA_SUBMIT'),('ProcurementHead','ASSET_DISPOSAL_BID_MANAGE'),('ProcurementHead','ASSET_DISPOSAL_AWARD'),
    ('Finance','ASSET_RETIREMENT_VIEW'),('Finance','ASSET_RETIREMENT_VALUATION_VIEW'),('Finance','ASSET_RETIREMENT_RECONCILE'),
    ('InternalAuditor','ASSET_RETIREMENT_VIEW'),('InternalAuditor','ASSET_RETIREMENT_AUDIT'),
    ('SuperAdmin','ASSET_RETIREMENT_VIEW'),('SuperAdmin','ASSET_RETIREMENT_REQUEST'),('SuperAdmin','ASSET_RETIREMENT_ASSESS'),('SuperAdmin','ASSET_RETIREMENT_VALUATION_VIEW'),('SuperAdmin','ASSET_RETIREMENT_DOFA_SUBMIT'),
    ('SuperAdmin','ASSET_SANITIZATION_EXECUTE'),('SuperAdmin','ASSET_SANITIZATION_VERIFY'),('SuperAdmin','ASSET_DISPOSAL_PREPARE'),('SuperAdmin','ASSET_DISPOSAL_BID_MANAGE'),('SuperAdmin','ASSET_DISPOSAL_AWARD'),
    ('SuperAdmin','ASSET_DISPOSAL_EXECUTE'),('SuperAdmin','ASSET_DISPOSAL_ACCEPT'),('SuperAdmin','ASSET_RETIREMENT_RECONCILE'),('SuperAdmin','ASSET_RETIREMENT_POLICY_ADMIN'),('SuperAdmin','ASSET_RETIREMENT_PROVIDER_ADMIN'),('SuperAdmin','ASSET_RETIREMENT_AUDIT')
  )x(role_name,capability) WHERE NOT EXISTS(SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=t.tenant_id AND g.principal_role=x.role_name AND g.capability=x.capability AND g.scope_type='TENANT');
END LOOP; END $$;

INSERT INTO tenant_subscriptions(tenant_id,feature_key,is_enabled) SELECT tenant_id,'dofa_module9_asset_retirement',false FROM tenants ON CONFLICT DO NOTHING;
INSERT INTO tenant_subscriptions(tenant_id,feature_key,is_enabled) SELECT tenant_id,'dofa_module9_disposal_gate',false FROM tenants ON CONFLICT DO NOTHING;
INSERT INTO tenant_subscriptions(tenant_id,feature_key,is_enabled) SELECT tenant_id,'dofa_module9_sanitization_gate',false FROM tenants ON CONFLICT DO NOTHING;
INSERT INTO tenant_subscriptions(tenant_id,feature_key,is_enabled) SELECT tenant_id,'dofa_module9_controlled_auction',false FROM tenants ON CONFLICT DO NOTHING;

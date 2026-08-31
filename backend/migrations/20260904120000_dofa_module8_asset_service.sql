-- DoFA Module 8: authoritative asset repairs, warranty and service management

ALTER TABLE acq_requests DROP CONSTRAINT IF EXISTS acq_requests_source_check;
ALTER TABLE acq_requests ADD CONSTRAINT acq_requests_source_check CHECK(source IN('FALCON','IRMS','LEGACY_P2P','INVENTORY_REPLENISHMENT','ASSET_SERVICE'));

CREATE TABLE IF NOT EXISTS svc_providers (
  service_provider_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  provider_type VARCHAR(20) NOT NULL CHECK(provider_type IN('INTERNAL','OEM','WARRANTY','EMPANELLED_EXTERNAL')),
  display_name VARCHAR(240) NOT NULL, vendor_id UUID REFERENCES fin_vendors(vendor_id) ON DELETE RESTRICT,
  internal_team_reference VARCHAR(160), authorization_reference VARCHAR(240), qualification_requirements JSONB NOT NULL DEFAULT '[]',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','SUSPENDED','EXPIRED','REVOKED')),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(), effective_to TIMESTAMPTZ, created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(tenant_id,display_name)
);

CREATE TABLE IF NOT EXISTS svc_warranty_entitlements (
  warranty_entitlement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT,
  source_type VARCHAR(32) NOT NULL CHECK(source_type IN('ACQUISITION','PURCHASE_ORDER','VERIFIED_INVOICE','MANUFACTURER','VENDOR','MANUAL_EVIDENCE')),
  source_reference JSONB NOT NULL, coverage_start DATE, coverage_end DATE, covered_failures JSONB NOT NULL DEFAULT '[]',
  exclusions JSONB NOT NULL DEFAULT '[]', permitted_work JSONB NOT NULL DEFAULT '[]', deductible NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency CHAR(3), evidence_hash CHAR(64) NOT NULL, revision INT NOT NULL DEFAULT 1 CHECK(revision>0), status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','SUPERSEDED','EXPIRED','REVOKED')),
  created_by UUID NOT NULL REFERENCES users(user_id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(inventory_record_id,source_type,revision)
);

CREATE TABLE IF NOT EXISTS svc_contracts (
  service_contract_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  service_provider_id UUID NOT NULL REFERENCES svc_providers(service_provider_id) ON DELETE RESTRICT,
  contract_type VARCHAR(20) NOT NULL CHECK(contract_type IN('AMC','CMC','WARRANTY_EXTENSION','CALIBRATION','INSPECTION')),
  contract_reference VARCHAR(200) NOT NULL, effective_from DATE NOT NULL, effective_to DATE NOT NULL,
  covered_product_models JSONB NOT NULL DEFAULT '[]', covered_assets JSONB NOT NULL DEFAULT '[]', coverage_terms JSONB NOT NULL,
  evidence_hash CHAR(64) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('DRAFT','ACTIVE','EXPIRED','SUPERSEDED','CANCELLED')),
  created_by UUID NOT NULL REFERENCES users(user_id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(tenant_id,contract_reference)
);

CREATE TABLE IF NOT EXISTS svc_preventive_policies (
  preventive_policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  category VARCHAR(120) NOT NULL DEFAULT '*', product_model_id UUID REFERENCES inv_product_models(product_model_id) ON DELETE RESTRICT,
  policy_version INT NOT NULL CHECK(policy_version>0), status VARCHAR(16) NOT NULL CHECK(status IN('DRAFT','PUBLISHED','SUPERSEDED')),
  interval_type VARCHAR(16) NOT NULL CHECK(interval_type IN('CALENDAR','METER','BOTH')), interval_days INT CHECK(interval_days IS NULL OR interval_days>0),
  meter_type VARCHAR(40), meter_interval NUMERIC(15,3) CHECK(meter_interval IS NULL OR meter_interval>0), warning_days INT NOT NULL DEFAULT 14 CHECK(warning_days>=0),
  overdue_hold_required BOOLEAN NOT NULL DEFAULT false, required_tasks JSONB NOT NULL DEFAULT '[]', required_qualifications JSONB NOT NULL DEFAULT '[]',
  approved_provider_types JSONB NOT NULL DEFAULT '["INTERNAL","OEM","WARRANTY","EMPANELLED_EXTERNAL"]', required_evidence JSONB NOT NULL DEFAULT '[]',
  acceptance_tests JSONB NOT NULL DEFAULT '[]', reverification_mode VARCHAR(24) NOT NULL DEFAULT 'RISK_BASED' CHECK(reverification_mode IN('NOT_REQUIRED','RISK_BASED','ALWAYS')),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(), effective_to TIMESTAMPTZ, published_by UUID REFERENCES users(user_id), published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(tenant_id,category,product_model_id,policy_version)
);

CREATE TABLE IF NOT EXISTS svc_cases (
  service_case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  case_number VARCHAR(100) NOT NULL, inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT,
  subject_id UUID NOT NULL REFERENCES pv_subjects(subject_id) ON DELETE RESTRICT, case_type VARCHAR(40) NOT NULL CHECK(case_type IN('CORRECTIVE_REPAIR','WARRANTY_CLAIM','PREVENTIVE_MAINTENANCE','CALIBRATION','INSPECTION','INTERNAL_MAINTENANCE','EXTERNAL_SERVICE','ACCIDENTAL_DAMAGE','MODULE7_REPAIR_REFERRAL')),
  workflow_status VARCHAR(32) NOT NULL DEFAULT 'DRAFT' CHECK(workflow_status IN('DRAFT','SUBMITTED','TRIAGE','APPROVED','SCHEDULED','IN_PROGRESS','AWAITING_PARTS','AWAITING_VENDOR','AWAITING_REVERIFICATION','ACCEPTANCE_PENDING','CLOSED','REJECTED','CANCELLED','ON_HOLD','DISPUTED','SUPERSEDED')),
  coverage_status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK(coverage_status IN('PENDING','IN_WARRANTY','AMC_COVERED','INTERNAL_SERVICE','CHARGEABLE','NOT_COVERED','EXCEPTION_REQUIRED')),
  asset_availability VARCHAR(32) NOT NULL DEFAULT 'AVAILABLE_PENDING_SERVICE' CHECK(asset_availability IN('AVAILABLE_PENDING_SERVICE','OUT_OF_SERVICE','INTERNAL_SERVICE_CUSTODY','VENDOR_SERVICE_CUSTODY','QUARANTINED','RETURNED_TO_CUSTODIAN')),
  final_outcome VARCHAR(32) CHECK(final_outcome IS NULL OR final_outcome IN('RESTORED','RESTORED_WITH_LIMITATIONS','NO_FAULT_FOUND','COMPONENT_REPLACED','REPAIR_UNSUCCESSFUL','IRREPARABLE','UNSAFE','REFERRED_TO_MODULE9')),
  title VARCHAR(240) NOT NULL, problem_description TEXT NOT NULL, severity VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK(severity IN('LOW','NORMAL','HIGH','SAFETY_CRITICAL')),
  reported_by UUID NOT NULL REFERENCES users(user_id), triage_approved_by UUID REFERENCES users(user_id), assigned_technician_id UUID REFERENCES users(user_id),
  service_provider_id UUID REFERENCES svc_providers(service_provider_id), previous_lifecycle_status VARCHAR(20),
  module7_case_id UUID REFERENCES ret_cases(return_case_id) ON DELETE RESTRICT, acquisition_id UUID REFERENCES acq_requests(acquisition_id) ON DELETE RESTRICT,
  procurement_case_id UUID REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  supersedes_service_case_id UUID REFERENCES svc_cases(service_case_id) ON DELETE RESTRICT, root_service_case_id UUID REFERENCES svc_cases(service_case_id) ON DELETE RESTRICT,
  previous_outcome VARCHAR(32), reopen_reason TEXT, preventive_policy_id UUID REFERENCES svc_preventive_policies(preventive_policy_id) ON DELETE RESTRICT,
  scheduled_for TIMESTAMPTZ, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, closed_at TIMESTAMPTZ,
  aggregate_revision BIGINT NOT NULL DEFAULT 1 CHECK(aggregate_revision>0), next_event_sequence BIGINT NOT NULL DEFAULT 1 CHECK(next_event_sequence>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(tenant_id,case_number),
  CHECK(triage_approved_by IS NULL OR triage_approved_by<>reported_by),
  CHECK((workflow_status='CLOSED' AND final_outcome IS NOT NULL AND closed_at IS NOT NULL) OR workflow_status<>'CLOSED')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_svc_active_asset_execution ON svc_cases(inventory_record_id)
  WHERE workflow_status IN('SUBMITTED','TRIAGE','APPROVED','SCHEDULED','IN_PROGRESS','AWAITING_PARTS','AWAITING_VENDOR','AWAITING_REVERIFICATION','ACCEPTANCE_PENDING','ON_HOLD','DISPUTED');
CREATE UNIQUE INDEX IF NOT EXISTS uq_svc_module7_referral ON svc_cases(module7_case_id) WHERE module7_case_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS svc_component_targets (
  component_target_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  service_case_id UUID NOT NULL REFERENCES svc_cases(service_case_id) ON DELETE RESTRICT, parent_inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT,
  component_inventory_record_id UUID REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT, component_name VARCHAR(200) NOT NULL,
  manufacturer_serial VARCHAR(200), component_reference JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS svc_asset_holds (
  service_hold_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  service_case_id UUID NOT NULL REFERENCES svc_cases(service_case_id) ON DELETE RESTRICT, inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','RELEASED','SUPERSEDED')), previous_lifecycle_status VARCHAR(20) NOT NULL,
  hold_reason TEXT NOT NULL, placed_by UUID NOT NULL REFERENCES users(user_id), placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), released_by UUID REFERENCES users(user_id),
  released_at TIMESTAMPTZ, release_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_svc_active_hold ON svc_asset_holds(inventory_record_id) WHERE status='ACTIVE';

CREATE TABLE IF NOT EXISTS svc_custody_history (
  custody_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  service_case_id UUID NOT NULL REFERENCES svc_cases(service_case_id) ON DELETE RESTRICT, inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT,
  previous_availability VARCHAR(32), new_availability VARCHAR(32) NOT NULL, provider_id UUID REFERENCES svc_providers(service_provider_id),
  service_location VARCHAR(240), carrier VARCHAR(120), shipment_reference VARCHAR(200), condition VARCHAR(40), evidence_manifest_hash CHAR(64),
  handed_over_by UUID REFERENCES users(user_id), received_by UUID REFERENCES users(user_id), occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS svc_coverage_snapshots (
  coverage_snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  service_case_id UUID NOT NULL REFERENCES svc_cases(service_case_id) ON DELETE RESTRICT, coverage_status VARCHAR(24) NOT NULL,
  source_precedence JSONB NOT NULL, coverage_payload JSONB NOT NULL, policy_version INT NOT NULL, reviewer_id UUID NOT NULL REFERENCES users(user_id),
  exception_approver_id UUID REFERENCES users(user_id), snapshot_hash CHAR(64) NOT NULL UNIQUE, decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(exception_approver_id IS NULL OR exception_approver_id<>reviewer_id)
);

CREATE TABLE IF NOT EXISTS svc_diagnoses (
  diagnosis_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  service_case_id UUID NOT NULL REFERENCES svc_cases(service_case_id) ON DELETE RESTRICT, revision INT NOT NULL CHECK(revision>0),
  fault_codes JSONB NOT NULL DEFAULT '[]', root_cause TEXT, safety_impact TEXT, proposed_work TEXT NOT NULL, scope_hash CHAR(64) NOT NULL,
  diagnosed_by UUID NOT NULL REFERENCES users(user_id), diagnosed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), supersedes_diagnosis_id UUID REFERENCES svc_diagnoses(diagnosis_id),
  UNIQUE(service_case_id,revision)
);

CREATE TABLE IF NOT EXISTS svc_estimate_revisions (
  estimate_revision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  service_case_id UUID NOT NULL REFERENCES svc_cases(service_case_id) ON DELETE RESTRICT, revision INT NOT NULL CHECK(revision>0),
  labor_amount NUMERIC(15,2) NOT NULL DEFAULT 0, parts_amount NUMERIC(15,2) NOT NULL DEFAULT 0, travel_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  other_amount NUMERIC(15,2) NOT NULL DEFAULT 0, total_amount NUMERIC(15,2) GENERATED ALWAYS AS(labor_amount+parts_amount+travel_amount+other_amount) STORED,
  currency CHAR(3) NOT NULL, estimated_duration_hours NUMERIC(10,2), scope_hash CHAR(64) NOT NULL, created_by UUID NOT NULL REFERENCES users(user_id),
  approved_by UUID REFERENCES users(user_id), approval_reference JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), approved_at TIMESTAMPTZ,
  UNIQUE(service_case_id,revision), CHECK(approved_by IS NULL OR approved_by<>created_by)
);

CREATE TABLE IF NOT EXISTS svc_tasks (
  service_task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  service_case_id UUID NOT NULL REFERENCES svc_cases(service_case_id) ON DELETE RESTRICT, task_code VARCHAR(80) NOT NULL, description TEXT NOT NULL,
  assigned_user_id UUID REFERENCES users(user_id), assigned_provider_id UUID REFERENCES svc_providers(service_provider_id),
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED')),
  required_evidence JSONB NOT NULL DEFAULT '[]', result JSONB, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(service_case_id,task_code)
);

CREATE TABLE IF NOT EXISTS svc_parts_usage (
  part_usage_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  service_case_id UUID NOT NULL REFERENCES svc_cases(service_case_id) ON DELETE RESTRICT,
  part_type VARCHAR(24) NOT NULL CHECK(part_type IN('STOCKED_CONSUMABLE','TRACKED_COMPONENT','NON_STOCK_PURCHASE')),
  product_model_id UUID REFERENCES inv_product_models(product_model_id), inventory_record_id UUID REFERENCES inv_records(inventory_record_id),
  module6_request_id UUID REFERENCES con_stock_requests(stock_request_id), procurement_case_id UUID REFERENCES proc_cases(proc_case_id),
  description VARCHAR(240) NOT NULL, quantity NUMERIC(12,3) NOT NULL CHECK(quantity>0), unit VARCHAR(40) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'REQUESTED' CHECK(status IN('REQUESTED','RESERVED','ISSUED','INSTALLED','CONSUMED','RETURNED','FAILED','RECONCILED')),
  removed_component_reference JSONB, installed_component_reference JSONB, part_warranty JSONB,
  requested_by UUID NOT NULL REFERENCES users(user_id), reconciled_by UUID REFERENCES users(user_id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reconciled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS svc_evidence (
  evidence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  service_case_id UUID NOT NULL REFERENCES svc_cases(service_case_id) ON DELETE RESTRICT, evidence_type VARCHAR(48) NOT NULL,
  object_key TEXT NOT NULL, content_hash CHAR(64) NOT NULL, mime_type VARCHAR(120) NOT NULL, byte_size BIGINT NOT NULL CHECK(byte_size>0),
  retention_class VARCHAR(32) NOT NULL DEFAULT 'ASSET_SERVICE', metadata JSONB NOT NULL DEFAULT '{}', captured_by UUID NOT NULL REFERENCES users(user_id),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), revision_of UUID REFERENCES svc_evidence(evidence_id), UNIQUE(tenant_id,service_case_id,content_hash)
);

CREATE TABLE IF NOT EXISTS svc_reverification_projections (
  reverification_projection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  service_case_id UUID NOT NULL REFERENCES svc_cases(service_case_id) ON DELETE RESTRICT, request_event_id UUID NOT NULL UNIQUE,
  required_reason JSONB NOT NULL, status VARCHAR(24) NOT NULL CHECK(status IN('REQUESTED','IN_PROGRESS','CLEARED','REJECTED','SUPERSEDED')),
  module4_case_id UUID, verification_identity_id UUID REFERENCES pv_verification_identities(verification_identity_id), source_event_id UUID UNIQUE,
  source_payload JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS svc_acceptance_decisions (
  acceptance_decision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  service_case_id UUID NOT NULL REFERENCES svc_cases(service_case_id) ON DELETE RESTRICT, decision VARCHAR(32) NOT NULL CHECK(decision IN('ACCEPTED','ACCEPTED_WITH_LIMITATIONS','REJECTED','IRREPARABLE','UNSAFE')),
  reason TEXT NOT NULL, limitations JSONB NOT NULL DEFAULT '{}', evidence_manifest_hash CHAR(64) NOT NULL, technician_or_provider_id UUID,
  accepted_by UUID NOT NULL REFERENCES users(user_id), previous_decision_hash CHAR(64), decision_hash CHAR(64) NOT NULL UNIQUE,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK(technician_or_provider_id IS NULL OR technician_or_provider_id<>accepted_by)
);

CREATE TABLE IF NOT EXISTS svc_financial_projections (
  financial_projection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  service_case_id UUID NOT NULL REFERENCES svc_cases(service_case_id) ON DELETE RESTRICT, source_event_id UUID NOT NULL UNIQUE,
  source_module VARCHAR(24) NOT NULL, projection_type VARCHAR(24) NOT NULL, amount NUMERIC(15,2) NOT NULL, currency CHAR(3) NOT NULL,
  source_reference JSONB NOT NULL, source_revision BIGINT NOT NULL, occurred_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS svc_preventive_schedules (
  preventive_schedule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT, preventive_policy_id UUID NOT NULL REFERENCES svc_preventive_policies(preventive_policy_id),
  due_at TIMESTAMPTZ NOT NULL, original_due_at TIMESTAMPTZ NOT NULL, meter_due NUMERIC(15,3), status VARCHAR(20) NOT NULL DEFAULT 'PLANNED' CHECK(status IN('PLANNED','DUE','OVERDUE','GENERATED','COMPLETED','CANCELLED')),
  generated_service_case_id UUID REFERENCES svc_cases(service_case_id), reschedule_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(inventory_record_id,preventive_policy_id,original_due_at)
);

CREATE TABLE IF NOT EXISTS svc_idempotency (
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, actor_id UUID NOT NULL REFERENCES users(user_id), idempotency_key VARCHAR(160) NOT NULL,
  request_hash CHAR(64) NOT NULL, response_payload JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(tenant_id,actor_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS svc_audit_events (
  audit_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  service_case_id UUID NOT NULL REFERENCES svc_cases(service_case_id), entity_type VARCHAR(40) NOT NULL, entity_id UUID NOT NULL, event_type VARCHAR(96) NOT NULL,
  actor_id UUID REFERENCES users(user_id), previous_value JSONB, new_value JSONB, previous_hash CHAR(64), event_hash CHAR(64) NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS svc_outbox_events (
  event_id UUID PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, aggregate_id UUID NOT NULL REFERENCES svc_cases(service_case_id),
  aggregate_revision BIGINT NOT NULL, aggregate_sequence BIGINT NOT NULL, event_type VARCHAR(104) NOT NULL, event_version INT NOT NULL DEFAULT 1,
  occurred_at TIMESTAMPTZ NOT NULL, payload JSONB NOT NULL, payload_hash CHAR(64) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0, available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), published_at TIMESTAMPTZ, last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(aggregate_id,aggregate_sequence)
);
CREATE TABLE IF NOT EXISTS svc_consumed_events (
  event_id UUID PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, event_type VARCHAR(104) NOT NULL, consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE proc_repairs ADD COLUMN IF NOT EXISTS managed_by VARCHAR(16) NOT NULL DEFAULT 'LEGACY' CHECK(managed_by IN('LEGACY','MODULE8'));
ALTER TABLE proc_repairs ADD COLUMN IF NOT EXISTS module8_service_case_id UUID REFERENCES svc_cases(service_case_id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_proc_repair_module8_case ON proc_repairs(module8_service_case_id) WHERE module8_service_case_id IS NOT NULL;
ALTER TABLE asset_maintenance_records ADD COLUMN IF NOT EXISTS managed_by VARCHAR(16) NOT NULL DEFAULT 'LEGACY' CHECK(managed_by IN('LEGACY','MODULE8'));
ALTER TABLE asset_maintenance_records ADD COLUMN IF NOT EXISTS module8_service_case_id UUID REFERENCES svc_cases(service_case_id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_maintenance_module8_case ON asset_maintenance_records(module8_service_case_id) WHERE module8_service_case_id IS NOT NULL;

CREATE OR REPLACE FUNCTION svc_block_immutable_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'ASSET_SERVICE_IMMUTABLE: append-only record cannot be changed'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER tr_svc_coverage_immutable BEFORE UPDATE OR DELETE ON svc_coverage_snapshots FOR EACH ROW EXECUTE FUNCTION svc_block_immutable_mutation();
CREATE TRIGGER tr_svc_diagnosis_immutable BEFORE UPDATE OR DELETE ON svc_diagnoses FOR EACH ROW EXECUTE FUNCTION svc_block_immutable_mutation();
CREATE TRIGGER tr_svc_estimate_immutable BEFORE UPDATE OR DELETE ON svc_estimate_revisions FOR EACH ROW EXECUTE FUNCTION svc_block_immutable_mutation();
CREATE TRIGGER tr_svc_evidence_immutable BEFORE UPDATE OR DELETE ON svc_evidence FOR EACH ROW EXECUTE FUNCTION svc_block_immutable_mutation();
CREATE TRIGGER tr_svc_acceptance_immutable BEFORE UPDATE OR DELETE ON svc_acceptance_decisions FOR EACH ROW EXECUTE FUNCTION svc_block_immutable_mutation();
CREATE TRIGGER tr_svc_custody_immutable BEFORE UPDATE OR DELETE ON svc_custody_history FOR EACH ROW EXECUTE FUNCTION svc_block_immutable_mutation();
CREATE TRIGGER tr_svc_audit_immutable BEFORE UPDATE OR DELETE ON svc_audit_events FOR EACH ROW EXECUTE FUNCTION svc_block_immutable_mutation();

CREATE OR REPLACE FUNCTION svc_prevent_closed_case_mutation() RETURNS trigger AS $$
BEGIN IF OLD.workflow_status='CLOSED' THEN RAISE EXCEPTION 'ASSET_SERVICE_CLOSED_IMMUTABLE'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER tr_svc_closed_case_immutable BEFORE UPDATE OR DELETE ON svc_cases FOR EACH ROW EXECUTE FUNCTION svc_prevent_closed_case_mutation();

CREATE INDEX IF NOT EXISTS idx_svc_case_queue ON svc_cases(tenant_id,workflow_status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_svc_case_asset ON svc_cases(inventory_record_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_svc_schedule_due ON svc_preventive_schedules(tenant_id,status,due_at);

DO $$ DECLARE t RECORD; BEGIN FOR t IN SELECT tenant_id FROM tenants LOOP
  INSERT INTO acq_access_grants(tenant_id,principal_role,capability,scope_type)
  SELECT t.tenant_id,x.role_name,x.capability,'TENANT' FROM(VALUES
    ('Faculty','ASSET_SERVICE_VIEW'),('Faculty','ASSET_SERVICE_REQUEST'),('LabAdmin','ASSET_SERVICE_VIEW'),('LabAdmin','ASSET_SERVICE_REQUEST'),('LabAdmin','ASSET_SERVICE_ACCEPT'),
    ('Stores','ASSET_SERVICE_VIEW'),('Stores','ASSET_SERVICE_PARTS_MANAGE'),
    ('ProcurementHead','ASSET_SERVICE_VIEW'),('ProcurementHead','ASSET_SERVICE_TRIAGE'),('ProcurementHead','ASSET_SERVICE_ASSIGN'),('ProcurementHead','ASSET_SERVICE_WARRANTY_REVIEW'),('ProcurementHead','ASSET_SERVICE_ESTIMATE_APPROVE'),
    ('Finance','ASSET_SERVICE_VIEW'),('Finance','ASSET_SERVICE_ESTIMATE_APPROVE'),
    ('InternalAuditor','ASSET_SERVICE_VIEW'),('InternalAuditor','ASSET_SERVICE_AUDIT'),
    ('SuperAdmin','ASSET_SERVICE_VIEW'),('SuperAdmin','ASSET_SERVICE_REQUEST'),('SuperAdmin','ASSET_SERVICE_TRIAGE'),('SuperAdmin','ASSET_SERVICE_ASSIGN'),('SuperAdmin','ASSET_SERVICE_EXECUTE'),('SuperAdmin','ASSET_SERVICE_WARRANTY_REVIEW'),('SuperAdmin','ASSET_SERVICE_WARRANTY_EXCEPTION'),('SuperAdmin','ASSET_SERVICE_ESTIMATE_APPROVE'),('SuperAdmin','ASSET_SERVICE_PARTS_MANAGE'),('SuperAdmin','ASSET_SERVICE_ACCEPT'),('SuperAdmin','ASSET_SERVICE_POLICY_ADMIN'),('SuperAdmin','ASSET_SERVICE_PROVIDER_ADMIN'),('SuperAdmin','ASSET_SERVICE_AUDIT'),('SuperAdmin','ASSET_SERVICE_RETIREMENT_REFER')
  )x(role_name,capability) WHERE NOT EXISTS(SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=t.tenant_id AND g.principal_role=x.role_name AND g.capability=x.capability AND g.scope_type='TENANT');
END LOOP; END $$;

INSERT INTO tenant_subscriptions(tenant_id,feature_key,is_enabled) SELECT tenant_id,'dofa_module8_asset_service',false FROM tenants ON CONFLICT DO NOTHING;
INSERT INTO tenant_subscriptions(tenant_id,feature_key,is_enabled) SELECT tenant_id,'dofa_module8_preventive_maintenance',false FROM tenants ON CONFLICT DO NOTHING;
INSERT INTO tenant_subscriptions(tenant_id,feature_key,is_enabled) SELECT tenant_id,'dofa_module8_service_gate',false FROM tenants ON CONFLICT DO NOTHING;

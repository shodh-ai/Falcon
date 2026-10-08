-- DoFA Module 7: exact-subject Return/DOA orchestration and recovery projections

ALTER TABLE acq_lines
  ADD COLUMN IF NOT EXISTS return_window_days INT CHECK(return_window_days IS NULL OR return_window_days>=0),
  ADD COLUMN IF NOT EXISTS doa_window_days INT CHECK(doa_window_days IS NULL OR doa_window_days>=0),
  ADD COLUMN IF NOT EXISTS return_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS replacement_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS refund_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS restocking_fee_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS return_shipping_responsibility VARCHAR(16) NOT NULL DEFAULT 'UNSPECIFIED'
    CHECK(return_shipping_responsibility IN('BUYER','VENDOR','SHARED','UNSPECIFIED')),
  ADD COLUMN IF NOT EXISTS policy_source_reference TEXT;

ALTER TABLE inv_records DROP CONSTRAINT IF EXISTS inv_records_lifecycle_status_check;
ALTER TABLE inv_records ADD CONSTRAINT inv_records_lifecycle_status_check
  CHECK(lifecycle_status IN('AVAILABLE','ASSIGNED','IN_USE','MAINTENANCE','RETURN_PENDING','RETURNED','RETIRED','WRITTEN_OFF','DISPOSED'));

CREATE TABLE IF NOT EXISTS ret_cases (
  return_case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  case_number VARCHAR(80) NOT NULL, case_type VARCHAR(24) NOT NULL CHECK(case_type IN('DOA','STANDARD_RETURN')),
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  acquisition_id UUID NOT NULL REFERENCES acq_requests(acquisition_id) ON DELETE RESTRICT,
  acquisition_version_id UUID NOT NULL REFERENCES acq_request_versions(acquisition_version_id) ON DELETE RESTRICT,
  acquisition_line_id UUID NOT NULL REFERENCES acq_lines(line_id) ON DELETE RESTRICT,
  order_line_id UUID NOT NULL REFERENCES proc_order_lines(order_line_id) ON DELETE RESTRICT,
  receipt_line_id UUID NOT NULL REFERENCES proc_receipt_lines(receipt_line_id) ON DELETE RESTRICT,
  vendor_id UUID REFERENCES fin_vendors(vendor_id) ON DELETE RESTRICT,
  reason TEXT NOT NULL, workflow_status VARCHAR(28) NOT NULL DEFAULT 'DRAFT'
    CHECK(workflow_status IN('DRAFT','SUBMITTED','TRIAGE','AWAITING_EVIDENCE','DECISION_PENDING','APPROVED','IN_EXECUTION','RESOLUTION_PENDING','CLOSED','REJECTED','CANCELLED','EXPIRED','DISPUTED','SUPERSEDED')),
  eligibility_status VARCHAR(28) NOT NULL DEFAULT 'PENDING'
    CHECK(eligibility_status IN('PENDING','ELIGIBLE','INELIGIBLE','WINDOW_EXPIRED','EXCEPTION_REQUIRED','INSUFFICIENT_EVIDENCE')),
  disposition VARCHAR(24) CHECK(disposition IS NULL OR disposition IN('REFUND','CREDIT_NOTE','REPLACEMENT_UNIT','REPAIR_RETURN','RETURN_ONLY','REPAIR_REFERRAL','NO_ACTION')),
  rma_status VARCHAR(20) NOT NULL DEFAULT 'NOT_REQUIRED' CHECK(rma_status IN('NOT_REQUIRED','REQUESTED','ISSUED','ACKNOWLEDGED','CLOSED')),
  shipment_status VARCHAR(24) NOT NULL DEFAULT 'NOT_SHIPPED' CHECK(shipment_status IN('NOT_SHIPPED','READY','SHIPPED','DELIVERED','VENDOR_RECEIVED')),
  submitted_at TIMESTAMPTZ, fault_discovered_at TIMESTAMPTZ, eligibility_deadline TIMESTAMPTZ,
  eligibility_policy_version INT, eligibility_snapshot_hash CHAR(64), active_decision_id UUID,
  initiator_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  eligibility_reviewer_id UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  approver_id UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  proc_return_id UUID REFERENCES proc_returns(return_id) ON DELETE SET NULL,
  aggregate_revision BIGINT NOT NULL DEFAULT 1 CHECK(aggregate_revision>0), next_event_sequence BIGINT NOT NULL DEFAULT 1 CHECK(next_event_sequence>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,case_number), CHECK(eligibility_reviewer_id IS NULL OR eligibility_reviewer_id<>initiator_id),
  CHECK(approver_id IS NULL OR approver_id<>initiator_id)
);

CREATE TABLE IF NOT EXISTS ret_policy_snapshots (
  policy_snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), return_case_id UUID NOT NULL UNIQUE REFERENCES ret_cases(return_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, precedence_sources JSONB NOT NULL,
  policy_payload JSONB NOT NULL, policy_version INT NOT NULL, snapshot_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ret_case_allocations (
  return_allocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), return_case_id UUID NOT NULL REFERENCES ret_cases(return_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, subject_id UUID NOT NULL REFERENCES pv_subjects(subject_id) ON DELETE RESTRICT,
  inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT,
  subject_type VARCHAR(8) NOT NULL CHECK(subject_type IN('ITEM','LOT')), quantity NUMERIC(15,3) NOT NULL CHECK(quantity>0),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','HELD','RELEASED','SHIPPED','RESOLVED','CANCELLED')),
  previous_lifecycle_status VARCHAR(20), held_at TIMESTAMPTZ, released_at TIMESTAMPTZ, shipped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(return_case_id,subject_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ret_active_item_allocation ON ret_case_allocations(subject_id)
  WHERE subject_type='ITEM' AND status='HELD';
CREATE INDEX IF NOT EXISTS idx_ret_active_lot_allocations ON ret_case_allocations(inventory_record_id,status)
  WHERE subject_type='LOT' AND status IN('HELD','SHIPPED');

CREATE TABLE IF NOT EXISTS ret_evidence (
  evidence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), return_case_id UUID NOT NULL REFERENCES ret_cases(return_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, evidence_type VARCHAR(48) NOT NULL,
  object_key TEXT NOT NULL, content_hash CHAR(64) NOT NULL, mime_type VARCHAR(120) NOT NULL, byte_size BIGINT NOT NULL CHECK(byte_size>0),
  retention_class VARCHAR(32) NOT NULL DEFAULT 'PROCUREMENT', metadata JSONB NOT NULL DEFAULT '{}', captured_by UUID NOT NULL REFERENCES users(user_id),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), revision_of UUID REFERENCES ret_evidence(evidence_id) ON DELETE RESTRICT,
  UNIQUE(tenant_id,return_case_id,content_hash)
);
CREATE TABLE IF NOT EXISTS ret_evidence_requests (
  evidence_request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), return_case_id UUID NOT NULL REFERENCES ret_cases(return_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, request_type VARCHAR(48) NOT NULL, instructions TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK(status IN('OPEN','SATISFIED','CANCELLED')), requested_by UUID NOT NULL REFERENCES users(user_id),
  due_at TIMESTAMPTZ, satisfied_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ret_decisions (
  decision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), return_case_id UUID NOT NULL REFERENCES ret_cases(return_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  decision_type VARCHAR(24) NOT NULL CHECK(decision_type IN('ELIGIBILITY','DISPOSITION','RECONSIDERATION')),
  decision VARCHAR(32) NOT NULL, decision_reason TEXT NOT NULL, actor_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  policy_snapshot_hash CHAR(64), evidence_manifest_hash CHAR(64), previous_decision_hash CHAR(64), decision_hash CHAR(64) NOT NULL UNIQUE,
  supersedes_decision_id UUID REFERENCES ret_decisions(decision_id) ON DELETE RESTRICT, decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE ret_cases ADD CONSTRAINT ret_cases_active_decision_fkey FOREIGN KEY(active_decision_id) REFERENCES ret_decisions(decision_id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS ret_vendor_communications (
  communication_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), return_case_id UUID NOT NULL REFERENCES ret_cases(return_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, vendor_id UUID REFERENCES fin_vendors(vendor_id) ON DELETE RESTRICT,
  channel VARCHAR(24) NOT NULL, direction VARCHAR(12) NOT NULL CHECK(direction IN('INBOUND','OUTBOUND')),
  sent_at TIMESTAMPTZ NOT NULL, sent_by UUID REFERENCES users(user_id), subject TEXT NOT NULL, content_hash CHAR(64) NOT NULL,
  attachment_manifest JSONB NOT NULL DEFAULT '[]', vendor_reference VARCHAR(200), response_received_at TIMESTAMPTZ, response_status VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ret_rma_history (
  rma_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), return_case_id UUID NOT NULL REFERENCES ret_cases(return_case_id), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  previous_status VARCHAR(20), new_status VARCHAR(20) NOT NULL, vendor_reference VARCHAR(200), actor_id UUID NOT NULL REFERENCES users(user_id), occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ret_shipment_history (
  shipment_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), return_case_id UUID NOT NULL REFERENCES ret_cases(return_case_id), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  previous_status VARCHAR(24), new_status VARCHAR(24) NOT NULL, carrier VARCHAR(120), tracking_reference VARCHAR(200), evidence_manifest JSONB NOT NULL DEFAULT '[]',
  actor_id UUID NOT NULL REFERENCES users(user_id), occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ret_execution_projections (
  projection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), return_case_id UUID NOT NULL UNIQUE REFERENCES ret_cases(return_case_id), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  proc_return_id UUID REFERENCES proc_returns(return_id), source_event_id UUID UNIQUE, execution_status VARCHAR(32) NOT NULL, source_revision BIGINT NOT NULL DEFAULT 1,
  payload JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ret_financial_projections (
  projection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), return_case_id UUID NOT NULL REFERENCES ret_cases(return_case_id), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  source_event_id UUID NOT NULL UNIQUE, recovery_type VARCHAR(32) NOT NULL, posted_amount NUMERIC(15,2) NOT NULL, retained_charges NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL, destination_bucket VARCHAR(16), recovery_account_reference VARCHAR(160), payload JSONB NOT NULL, posted_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS ret_lineage (
  lineage_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), return_case_id UUID NOT NULL REFERENCES ret_cases(return_case_id), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  lineage_type VARCHAR(24) NOT NULL CHECK(lineage_type IN('REPAIR_RETURN','REPLACEMENT_UNIT')),
  original_subject_id UUID NOT NULL REFERENCES pv_subjects(subject_id), resulting_subject_id UUID REFERENCES pv_subjects(subject_id),
  original_inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id), resulting_inventory_record_id UUID REFERENCES inv_records(inventory_record_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(return_case_id,original_subject_id)
);

ALTER TABLE proc_returns
  ADD COLUMN IF NOT EXISTS managed_by VARCHAR(16) NOT NULL DEFAULT 'LEGACY' CHECK(managed_by IN('LEGACY','MODULE7')),
  ADD COLUMN IF NOT EXISTS module7_case_id UUID REFERENCES ret_cases(return_case_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS module7_decision_id UUID REFERENCES ret_decisions(decision_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS decision_hash CHAR(64), ADD COLUMN IF NOT EXISTS policy_snapshot_hash CHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS uq_proc_return_module7_case ON proc_returns(module7_case_id) WHERE module7_case_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS proc_return_subject_allocations (
  return_subject_allocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), return_id UUID NOT NULL REFERENCES proc_returns(return_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, module7_allocation_id UUID NOT NULL UNIQUE REFERENCES ret_case_allocations(return_allocation_id),
  subject_id UUID NOT NULL REFERENCES pv_subjects(subject_id), inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id),
  quantity NUMERIC(15,3) NOT NULL CHECK(quantity>0), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(return_id,subject_id)
);

CREATE TABLE IF NOT EXISTS proc_financial_recovery_policies (
  financial_recovery_policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  policy_version INT NOT NULL CHECK(policy_version>0), status VARCHAR(16) NOT NULL CHECK(status IN('DRAFT','PUBLISHED','SUPERSEDED')),
  funding_source_type VARCHAR(40) NOT NULL DEFAULT '*', open_period_reusable BOOLEAN NOT NULL DEFAULT true,
  closed_period_reusable BOOLEAN NOT NULL DEFAULT false, grant_recovery_reusable BOOLEAN NOT NULL DEFAULT false,
  recovery_account_reference VARCHAR(160), effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(), effective_to TIMESTAMPTZ,
  published_by UUID REFERENCES users(user_id), published_at TIMESTAMPTZ, UNIQUE(tenant_id,funding_source_type,policy_version)
);
CREATE TABLE IF NOT EXISTS proc_financial_recoveries (
  financial_recovery_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id), return_id UUID NOT NULL REFERENCES proc_returns(return_id), adjustment_id UUID REFERENCES proc_adjustments(adjustment_id),
  policy_id UUID NOT NULL REFERENCES proc_financial_recovery_policies(financial_recovery_policy_id), original_expenditure NUMERIC(15,2) NOT NULL,
  posted_recovery NUMERIC(15,2) NOT NULL, retained_charges NUMERIC(15,2) NOT NULL DEFAULT 0, net_effective_expenditure NUMERIC(15,2) NOT NULL,
  destination_bucket VARCHAR(16) NOT NULL CHECK(destination_bucket IN('AVAILABLE','RELEASED')), recovery_account_reference VARCHAR(160),
  posted_by UUID NOT NULL REFERENCES users(user_id), idempotency_key VARCHAR(160) NOT NULL, posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,idempotency_key), CHECK(original_expenditure-posted_recovery+retained_charges=net_effective_expenditure)
);

CREATE TABLE IF NOT EXISTS ret_idempotency (
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, actor_id UUID NOT NULL REFERENCES users(user_id), idempotency_key VARCHAR(160) NOT NULL,
  request_hash CHAR(64) NOT NULL, response_payload JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(tenant_id,actor_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS ret_audit_events (
  audit_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  return_case_id UUID NOT NULL REFERENCES ret_cases(return_case_id), entity_type VARCHAR(40) NOT NULL, entity_id UUID NOT NULL, event_type VARCHAR(80) NOT NULL,
  actor_id UUID REFERENCES users(user_id), previous_value JSONB, new_value JSONB, previous_hash CHAR(64), event_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ret_outbox_events (
  event_id UUID PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, aggregate_id UUID NOT NULL REFERENCES ret_cases(return_case_id),
  aggregate_revision BIGINT NOT NULL, aggregate_sequence BIGINT NOT NULL, event_type VARCHAR(96) NOT NULL, event_version INT NOT NULL DEFAULT 1,
  occurred_at TIMESTAMPTZ NOT NULL, payload JSONB NOT NULL, payload_hash CHAR(64) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0, available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), published_at TIMESTAMPTZ, last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(aggregate_id,aggregate_sequence)
);
CREATE TABLE IF NOT EXISTS ret_consumed_events (
  event_id UUID PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  event_type VARCHAR(96) NOT NULL, consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION ret_block_immutable_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'RETURN_IMMUTABLE: append-only record cannot be changed'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER tr_ret_evidence_immutable BEFORE UPDATE OR DELETE ON ret_evidence FOR EACH ROW EXECUTE FUNCTION ret_block_immutable_mutation();
CREATE TRIGGER tr_ret_decisions_immutable BEFORE UPDATE OR DELETE ON ret_decisions FOR EACH ROW EXECUTE FUNCTION ret_block_immutable_mutation();
CREATE TRIGGER tr_ret_vendor_communications_immutable BEFORE UPDATE OR DELETE ON ret_vendor_communications FOR EACH ROW EXECUTE FUNCTION ret_block_immutable_mutation();
CREATE TRIGGER tr_ret_audit_immutable BEFORE UPDATE OR DELETE ON ret_audit_events FOR EACH ROW EXECUTE FUNCTION ret_block_immutable_mutation();

CREATE OR REPLACE FUNCTION ret_check_allocation_conservation() RETURNS trigger AS $$
DECLARE target UUID; kind VARCHAR; held NUMERIC; eligible NUMERIC; reserved NUMERIC;
BEGIN
  target:=COALESCE(NEW.inventory_record_id,OLD.inventory_record_id);
  SELECT record_type INTO kind FROM inv_records WHERE inventory_record_id=target FOR UPDATE;
  IF kind='LOT' THEN
    IF EXISTS(SELECT 1 FROM ret_case_allocations a JOIN inv_records r ON r.inventory_record_id=a.inventory_record_id JOIN inv_procurement_batches b ON b.procurement_batch_id=r.procurement_batch_id JOIN ret_cases c ON c.return_case_id=a.return_case_id WHERE a.inventory_record_id=target AND(a.subject_id<>r.subject_id OR c.receipt_line_id<>b.receipt_line_id OR c.order_line_id<>b.order_line_id OR c.acquisition_line_id<>b.acquisition_line_id)) THEN RAISE EXCEPTION 'RETURN_SUBJECT_REFERENCE_MISMATCH'; END IF;
    SELECT COALESCE(SUM(quantity),0) INTO held FROM ret_case_allocations WHERE inventory_record_id=target AND status='HELD';
    SELECT COALESCE(SUM(signed_quantity),0) INTO eligible FROM inv_lot_movements WHERE inventory_record_id=target;
    SELECT COALESCE(SUM(a.allocated_quantity-a.issued_quantity),0) INTO reserved
      FROM con_reservation_allocations a JOIN con_reservations r ON r.reservation_id=a.reservation_id
      WHERE a.inventory_record_id=target AND a.status IN('ACTIVE','PARTIALLY_CONSUMED') AND r.expires_at>NOW();
    IF held>eligible-reserved+0.0005 THEN RAISE EXCEPTION 'RETURN_ALLOCATION_EXCEEDED'; END IF;
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER tr_ret_allocation_conservation AFTER INSERT OR UPDATE OR DELETE ON ret_case_allocations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ret_check_allocation_conservation();

CREATE INDEX IF NOT EXISTS idx_ret_case_queue ON ret_cases(tenant_id,workflow_status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ret_case_scope ON ret_cases(tenant_id,proc_case_id,receipt_line_id);
CREATE INDEX IF NOT EXISTS idx_ret_evidence_case ON ret_evidence(return_case_id,captured_at);

DO $$ DECLARE t RECORD; BEGIN FOR t IN SELECT tenant_id FROM tenants LOOP
  INSERT INTO proc_financial_recovery_policies(tenant_id,policy_version,status,published_at)
  VALUES(t.tenant_id,1,'PUBLISHED',NOW()) ON CONFLICT DO NOTHING;
  INSERT INTO acq_access_grants(tenant_id,principal_role,capability,scope_type)
  SELECT t.tenant_id,x.role_name,x.capability,'TENANT' FROM(VALUES
    ('Faculty','RETURNS_VIEW'),('Faculty','RETURNS_INITIATE'),('LabAdmin','RETURNS_VIEW'),('LabAdmin','RETURNS_INITIATE'),
    ('Stores','RETURNS_VIEW'),('Stores','RETURNS_INITIATE'),('Stores','RETURNS_VENDOR_COORDINATE'),('Stores','RETURNS_SHIP'),
    ('ProcurementHead','RETURNS_VIEW'),('ProcurementHead','RETURNS_ELIGIBILITY_REVIEW'),('ProcurementHead','RETURNS_APPROVE'),('ProcurementHead','RETURNS_RECONSIDER'),
    ('Finance','RETURNS_VIEW'),('InternalAuditor','RETURNS_VIEW'),('InternalAuditor','RETURNS_AUDIT'),
    ('SuperAdmin','RETURNS_VIEW'),('SuperAdmin','RETURNS_INITIATE'),('SuperAdmin','RETURNS_ELIGIBILITY_REVIEW'),('SuperAdmin','RETURNS_APPROVE'),('SuperAdmin','RETURNS_VENDOR_COORDINATE'),('SuperAdmin','RETURNS_SHIP'),('SuperAdmin','RETURNS_RECONSIDER'),('SuperAdmin','RETURNS_POLICY_ADMIN'),('SuperAdmin','RETURNS_AUDIT')
  )x(role_name,capability) WHERE NOT EXISTS(SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=t.tenant_id AND g.principal_role=x.role_name AND g.capability=x.capability AND g.scope_type='TENANT');
END LOOP; END $$;
INSERT INTO tenant_subscriptions(tenant_id,feature_key,is_enabled) SELECT tenant_id,'dofa_module7_returns',false FROM tenants ON CONFLICT DO NOTHING;
INSERT INTO tenant_subscriptions(tenant_id,feature_key,is_enabled) SELECT tenant_id,'dofa_module7_financial_recovery_gate',false FROM tenants ON CONFLICT DO NOTHING;

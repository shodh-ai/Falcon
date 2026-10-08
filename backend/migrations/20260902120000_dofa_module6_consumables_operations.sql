-- DOFA Module 6: consumables requests, reservations, custody, counts and replenishment

ALTER TABLE acq_requests DROP CONSTRAINT IF EXISTS acq_requests_source_check;
ALTER TABLE acq_requests ADD CONSTRAINT acq_requests_source_check CHECK(source IN('FALCON','IRMS','LEGACY_P2P','INVENTORY_REPLENISHMENT'));

ALTER TABLE inv_lot_movements DROP CONSTRAINT IF EXISTS inv_lot_movements_movement_type_check;
ALTER TABLE inv_lot_movements ADD CONSTRAINT inv_lot_movements_movement_type_check CHECK(movement_type IN('RECEIPT','ADJUSTMENT_IN','ADJUSTMENT_OUT','ISSUE','ISSUE_RETURN','TRANSFER_IN','TRANSFER_OUT','RETURN','WRITE_OFF'));
ALTER TABLE inv_lot_movements
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(40), ADD COLUMN IF NOT EXISTS source_id UUID,
  ADD COLUMN IF NOT EXISTS reason_code VARCHAR(60), ADD COLUMN IF NOT EXISTS department_id INT REFERENCES departments(dept_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_reference VARCHAR(160), ADD COLUMN IF NOT EXISTS location_space_id UUID REFERENCES campus_spaces(space_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(160);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_lot_movement_idempotency ON inv_lot_movements(tenant_id,idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS con_stock_policies (
  stock_policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  category VARCHAR(120), product_model_id UUID REFERENCES inv_product_models(product_model_id) ON DELETE RESTRICT,
  department_id INT REFERENCES departments(dept_id) ON DELETE CASCADE, location_space_id UUID REFERENCES campus_spaces(space_id) ON DELETE CASCADE,
  policy_version INT NOT NULL CHECK(policy_version>0), status VARCHAR(16) NOT NULL CHECK(status IN('DRAFT','PUBLISHED','SUPERSEDED')),
  minimum_level NUMERIC(15,3) NOT NULL DEFAULT 0, reorder_level NUMERIC(15,3) NOT NULL DEFAULT 0,
  safety_level NUMERIC(15,3) NOT NULL DEFAULT 0, target_level NUMERIC(15,3) NOT NULL DEFAULT 0,
  reservation_hours INT NOT NULL DEFAULT 48 CHECK(reservation_hours BETWEEN 1 AND 720), allocation_method VARCHAR(8) NOT NULL DEFAULT 'FEFO' CHECK(allocation_method IN('FEFO','FIFO')),
  controlled_item BOOLEAN NOT NULL DEFAULT false, hazardous_item BOOLEAN NOT NULL DEFAULT false, emergency_issue_allowed BOOLEAN NOT NULL DEFAULT true,
  count_frequency_days INT NOT NULL DEFAULT 90, count_variance_tolerance NUMERIC(15,3) NOT NULL DEFAULT 0,
  expiry_warning_days JSONB NOT NULL DEFAULT '[90,60,30]', inactivity_days INT NOT NULL DEFAULT 90,
  anomaly_window_days INT NOT NULL DEFAULT 7, anomaly_multiplier NUMERIC(8,3) NOT NULL DEFAULT 2,
  replenishment_lead_days INT NOT NULL DEFAULT 30, published_by UUID REFERENCES users(user_id), published_at TIMESTAMPTZ,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(), effective_to TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,category,product_model_id,department_id,location_space_id,policy_version)
);

CREATE TABLE IF NOT EXISTS con_stock_requests (
  stock_request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  request_number VARCHAR(80) NOT NULL, requester_id UUID NOT NULL REFERENCES users(user_id), department_id INT NOT NULL REFERENCES departments(dept_id),
  project_reference VARCHAR(160), delivery_location_id UUID REFERENCES campus_spaces(space_id), intended_use TEXT NOT NULL,
  required_by_date DATE, priority VARCHAR(16) NOT NULL DEFAULT 'NORMAL' CHECK(priority IN('LOW','NORMAL','HIGH','URGENT')),
  justification TEXT, status VARCHAR(24) NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','SUBMITTED','APPROVED','PARTIALLY_ISSUED','ISSUED','CLOSED','REJECTED','CANCELLED','EXPIRED')),
  aggregate_revision BIGINT NOT NULL DEFAULT 1, next_event_sequence BIGINT NOT NULL DEFAULT 1, submitted_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(user_id), approved_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,request_number), CHECK(approved_by IS NULL OR approved_by<>requester_id)
);
CREATE TABLE IF NOT EXISTS con_stock_request_lines (
  request_line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), stock_request_id UUID NOT NULL REFERENCES con_stock_requests(stock_request_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, product_model_id UUID NOT NULL REFERENCES inv_product_models(product_model_id),
  requested_quantity NUMERIC(15,3) NOT NULL CHECK(requested_quantity>0), approved_quantity NUMERIC(15,3), unit_of_measure VARCHAR(40) NOT NULL,
  policy_id UUID REFERENCES con_stock_policies(stock_policy_id), status VARCHAR(20) NOT NULL DEFAULT 'PENDING', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS con_reservations (
  reservation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), stock_request_id UUID NOT NULL REFERENCES con_stock_requests(stock_request_id),
  request_line_id UUID NOT NULL REFERENCES con_stock_request_lines(request_line_id), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','PARTIALLY_CONSUMED','FULFILLED','RELEASED','EXPIRED','CANCELLED')),
  reserved_quantity NUMERIC(15,3) NOT NULL CHECK(reserved_quantity>0), issued_quantity NUMERIC(15,3) NOT NULL DEFAULT 0 CHECK(issued_quantity>=0),
  policy_id UUID NOT NULL REFERENCES con_stock_policies(stock_policy_id), expires_at TIMESTAMPTZ NOT NULL, created_by UUID NOT NULL REFERENCES users(user_id),
  released_at TIMESTAMPTZ, release_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(request_line_id)
);
CREATE TABLE IF NOT EXISTS con_reservation_allocations (
  allocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), reservation_id UUID NOT NULL REFERENCES con_reservations(reservation_id),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id),
  allocated_quantity NUMERIC(15,3) NOT NULL CHECK(allocated_quantity>0), issued_quantity NUMERIC(15,3) NOT NULL DEFAULT 0 CHECK(issued_quantity>=0),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','PARTIALLY_CONSUMED','FULFILLED','RELEASED','EXPIRED','CANCELLED')),
  allocation_order INT NOT NULL, override_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(reservation_id,inventory_record_id)
);

CREATE TABLE IF NOT EXISTS con_issues (
  issue_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  stock_request_id UUID REFERENCES con_stock_requests(stock_request_id), reservation_id UUID REFERENCES con_reservations(reservation_id),
  recipient_id UUID NOT NULL REFERENCES users(user_id), department_id INT NOT NULL REFERENCES departments(dept_id), emergency BOOLEAN NOT NULL DEFAULT false,
  reason_code VARCHAR(60) NOT NULL, reason TEXT NOT NULL, issued_by UUID NOT NULL REFERENCES users(user_id), issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ, acknowledged_by UUID REFERENCES users(user_id), status VARCHAR(24) NOT NULL DEFAULT 'ISSUED' CHECK(status IN('ISSUED','PARTIALLY_RESOLVED','RESOLVED')),
  review_due_at TIMESTAMPTZ, aggregate_revision BIGINT NOT NULL DEFAULT 1, next_event_sequence BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS con_issue_allocations (
  issue_allocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), issue_id UUID NOT NULL REFERENCES con_issues(issue_id),
  allocation_id UUID REFERENCES con_reservation_allocations(allocation_id), inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, issued_quantity NUMERIC(15,3) NOT NULL CHECK(issued_quantity>0),
  consumed_quantity NUMERIC(15,3) NOT NULL DEFAULT 0, returned_quantity NUMERIC(15,3) NOT NULL DEFAULT 0, unit_of_measure VARCHAR(40) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK(consumed_quantity+returned_quantity<=issued_quantity)
);
CREATE TABLE IF NOT EXISTS con_custody_events (
  custody_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  issue_id UUID NOT NULL REFERENCES con_issues(issue_id), issue_allocation_id UUID NOT NULL REFERENCES con_issue_allocations(issue_allocation_id),
  event_type VARCHAR(20) NOT NULL CHECK(event_type IN('ISSUED','CONSUMED','ISSUE_RETURNED')),
  quantity NUMERIC(15,3) NOT NULL CHECK(quantity>0), actor_id UUID NOT NULL REFERENCES users(user_id), reason TEXT NOT NULL,
  source_movement_id UUID REFERENCES inv_lot_movements(lot_movement_id), idempotency_key VARCHAR(160) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(tenant_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS con_emergency_reviews (
  emergency_review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), issue_id UUID NOT NULL UNIQUE REFERENCES con_issues(issue_id), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  decision VARCHAR(32) NOT NULL CHECK(decision IN('REVIEWED','POLICY_BREACH_RECORDED')), reviewer_id UUID NOT NULL REFERENCES users(user_id),
  review_notes TEXT NOT NULL, reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS con_count_sessions (
  count_session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  location_space_id UUID REFERENCES campus_spaces(space_id), department_id INT REFERENCES departments(dept_id), product_model_id UUID REFERENCES inv_product_models(product_model_id),
  status VARCHAR(24) NOT NULL DEFAULT 'PLANNED' CHECK(status IN('PLANNED','COUNTING','SUBMITTED','REVIEW_PENDING','APPROVED','POSTED','RECOUNT_REQUIRED','REJECTED','CANCELLED')),
  policy_id UUID NOT NULL REFERENCES con_stock_policies(stock_policy_id), counter_id UUID NOT NULL REFERENCES users(user_id), reviewer_id UUID REFERENCES users(user_id),
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), snapshot_revision_hash CHAR(64) NOT NULL, aggregate_revision BIGINT NOT NULL DEFAULT 1, next_event_sequence BIGINT NOT NULL DEFAULT 1,
  created_by UUID NOT NULL REFERENCES users(user_id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), submitted_at TIMESTAMPTZ, posted_at TIMESTAMPTZ,
  CHECK(reviewer_id IS NULL OR reviewer_id<>counter_id)
);
CREATE TABLE IF NOT EXISTS con_count_lines (
  count_line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), count_session_id UUID NOT NULL REFERENCES con_count_sessions(count_session_id),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id),
  expected_quantity NUMERIC(15,3) NOT NULL, counted_quantity NUMERIC(15,3), variance NUMERIC(15,3),
  evidence JSONB NOT NULL DEFAULT '[]', last_movement_at_snapshot TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(count_session_id,inventory_record_id)
);

CREATE TABLE IF NOT EXISTS con_lot_eligibility (
  inventory_record_id UUID PRIMARY KEY REFERENCES inv_records(inventory_record_id), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  status VARCHAR(24) NOT NULL CHECK(status IN('AVAILABLE','EXPIRING_SOON','EXPIRED','QUARANTINED','DEPLETED')),
  reason TEXT, policy_id UUID REFERENCES con_stock_policies(stock_policy_id), calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS con_alerts (
  alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  alert_type VARCHAR(40) NOT NULL, product_model_id UUID REFERENCES inv_product_models(product_model_id), inventory_record_id UUID REFERENCES inv_records(inventory_record_id),
  location_space_id UUID REFERENCES campus_spaces(space_id), status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK(status IN('OPEN','ACKNOWLEDGED','RESOLVED')),
  dedupe_key VARCHAR(300) NOT NULL, details JSONB NOT NULL DEFAULT '{}', occurrence_count INT NOT NULL DEFAULT 1,
  aggregate_revision BIGINT NOT NULL DEFAULT 1, next_event_sequence BIGINT NOT NULL DEFAULT 1,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), acknowledged_by UUID REFERENCES users(user_id), resolved_at TIMESTAMPTZ,
  CHECK(occurrence_count>0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_con_active_alert ON con_alerts(tenant_id,dedupe_key) WHERE status IN('OPEN','ACKNOWLEDGED');
CREATE TABLE IF NOT EXISTS con_replenishment_suggestions (
  suggestion_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  product_model_id UUID NOT NULL REFERENCES inv_product_models(product_model_id), department_id INT REFERENCES departments(dept_id), location_space_id UUID REFERENCES campus_spaces(space_id),
  policy_id UUID NOT NULL REFERENCES con_stock_policies(stock_policy_id), available_quantity NUMERIC(15,3) NOT NULL, confirmed_inbound NUMERIC(15,3) NOT NULL,
  target_quantity NUMERIC(15,3) NOT NULL, suggested_quantity NUMERIC(15,3) NOT NULL CHECK(suggested_quantity>=0), status VARCHAR(24) NOT NULL DEFAULT 'OPEN' CHECK(status IN('OPEN','ACKNOWLEDGED','CONVERTED','DISMISSED')),
  aggregate_revision BIGINT NOT NULL DEFAULT 1, next_event_sequence BIGINT NOT NULL DEFAULT 1,
  acquisition_id UUID REFERENCES acq_requests(acquisition_id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), converted_at TIMESTAMPTZ,
  CHECK(target_quantity>=0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_con_open_suggestion ON con_replenishment_suggestions(tenant_id,product_model_id,COALESCE(department_id,0),COALESCE(location_space_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE status='OPEN';

CREATE TABLE IF NOT EXISTS con_outbox_events (
  event_id UUID PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, aggregate_id UUID NOT NULL,
  aggregate_revision BIGINT NOT NULL, aggregate_sequence BIGINT NOT NULL, event_type VARCHAR(96) NOT NULL, event_version INT NOT NULL DEFAULT 1,
  occurred_at TIMESTAMPTZ NOT NULL, payload JSONB NOT NULL, payload_hash CHAR(64) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0, available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), published_at TIMESTAMPTZ, last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(aggregate_id,aggregate_sequence)
);
CREATE TABLE IF NOT EXISTS con_idempotency (
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, actor_id UUID NOT NULL REFERENCES users(user_id), idempotency_key VARCHAR(160) NOT NULL,
  request_hash CHAR(64) NOT NULL, response_payload JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(tenant_id,actor_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS con_audit_events (
  audit_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  aggregate_id UUID NOT NULL, entity_type VARCHAR(40) NOT NULL, entity_id UUID NOT NULL, event_type VARCHAR(80) NOT NULL,
  actor_id UUID REFERENCES users(user_id), previous_value JSONB, new_value JSONB, previous_hash CHAR(64), event_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION con_block_immutable_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'CONSUMABLES_IMMUTABLE: append-only record cannot be changed'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER tr_con_custody_immutable BEFORE UPDATE OR DELETE ON con_custody_events FOR EACH ROW EXECUTE FUNCTION con_block_immutable_mutation();
CREATE TRIGGER tr_con_audit_immutable BEFORE UPDATE OR DELETE ON con_audit_events FOR EACH ROW EXECUTE FUNCTION con_block_immutable_mutation();

CREATE INDEX IF NOT EXISTS idx_con_request_queue ON con_stock_requests(tenant_id,department_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_con_reservation_expiry ON con_reservations(status,expires_at) WHERE status IN('ACTIVE','PARTIALLY_CONSUMED');
CREATE INDEX IF NOT EXISTS idx_con_alloc_lot ON con_reservation_allocations(inventory_record_id,status);
CREATE INDEX IF NOT EXISTS idx_con_issue_recipient ON con_issues(tenant_id,recipient_id,status);
CREATE INDEX IF NOT EXISTS idx_con_alert_queue ON con_alerts(tenant_id,status,alert_type,last_seen_at DESC);

DO $$ DECLARE t RECORD; BEGIN FOR t IN SELECT tenant_id FROM tenants LOOP
  INSERT INTO con_stock_policies(tenant_id,policy_version,status,minimum_level,reorder_level,safety_level,target_level,published_at)
  VALUES(t.tenant_id,1,'PUBLISHED',0,0,0,0,NOW()) ON CONFLICT DO NOTHING;
  INSERT INTO acq_access_grants(tenant_id,principal_role,capability,scope_type)
  SELECT t.tenant_id,x.role_name,x.capability,'TENANT' FROM(VALUES
    ('Faculty','CONSUMABLES_VIEW'),('Faculty','CONSUMABLES_REQUEST'),('Faculty','CONSUMABLES_CONSUMPTION_RECORD'),
    ('LabAdmin','CONSUMABLES_VIEW'),('LabAdmin','CONSUMABLES_REQUEST'),('LabAdmin','CONSUMABLES_CONSUMPTION_RECORD'),
    ('Stores','CONSUMABLES_VIEW'),('Stores','CONSUMABLES_APPROVE'),('Stores','CONSUMABLES_ISSUE'),('Stores','CONSUMABLES_EMERGENCY_ISSUE'),('Stores','CONSUMABLES_COUNT'),
    ('ProcurementHead','CONSUMABLES_VIEW'),('ProcurementHead','CONSUMABLES_EMERGENCY_REVIEW'),('ProcurementHead','CONSUMABLES_COUNT_APPROVE'),('ProcurementHead','CONSUMABLES_REPLENISHMENT_CONVERT'),
    ('SuperAdmin','CONSUMABLES_VIEW'),('SuperAdmin','CONSUMABLES_REQUEST'),('SuperAdmin','CONSUMABLES_APPROVE'),('SuperAdmin','CONSUMABLES_ISSUE'),('SuperAdmin','CONSUMABLES_CONSUMPTION_RECORD'),('SuperAdmin','CONSUMABLES_EMERGENCY_ISSUE'),('SuperAdmin','CONSUMABLES_EMERGENCY_REVIEW'),('SuperAdmin','CONSUMABLES_COUNT'),('SuperAdmin','CONSUMABLES_COUNT_APPROVE'),('SuperAdmin','CONSUMABLES_POLICY_ADMIN'),('SuperAdmin','CONSUMABLES_REPLENISHMENT_CONVERT'),('SuperAdmin','CONSUMABLES_AUDIT')
  )x(role_name,capability) WHERE NOT EXISTS(SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=t.tenant_id AND g.principal_role=x.role_name AND g.capability=x.capability AND g.scope_type='TENANT');
END LOOP; END $$;
INSERT INTO tenant_subscriptions(tenant_id,feature_key,is_enabled) SELECT tenant_id,'dofa_module6_consumables',false FROM tenants ON CONFLICT DO NOTHING;
INSERT INTO tenant_subscriptions(tenant_id,feature_key,is_enabled) SELECT tenant_id,'dofa_module6_replenishment',false FROM tenants ON CONFLICT DO NOTHING;

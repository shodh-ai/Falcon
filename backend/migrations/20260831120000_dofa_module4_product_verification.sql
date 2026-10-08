-- DoFA Module 4: trusted physical product verification and signed subject identities

CREATE TABLE IF NOT EXISTS pv_geofence_policies (
  geofence_policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  campus_reference VARCHAR(160) NOT NULL DEFAULT '*',
  policy_version INT NOT NULL CHECK (policy_version > 0),
  status VARCHAR(20) NOT NULL CHECK (status IN ('DRAFT','PUBLISHED','SUPERSEDED')),
  geometry_type VARCHAR(16) NOT NULL CHECK (geometry_type IN ('CIRCLE','POLYGON')),
  geometry JSONB NOT NULL,
  maximum_accuracy_metres NUMERIC(8,2) NOT NULL DEFAULT 50 CHECK (maximum_accuracy_metres > 0),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  published_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id,campus_reference,policy_version)
);

CREATE TABLE IF NOT EXISTS pv_verification_policies (
  verification_policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  category VARCHAR(120) NOT NULL DEFAULT '*',
  subject_type VARCHAR(12) NOT NULL CHECK (subject_type IN ('ITEM','LOT')),
  policy_version INT NOT NULL CHECK (policy_version > 0),
  status VARCHAR(20) NOT NULL CHECK (status IN ('DRAFT','PUBLISHED','SUPERSEDED')),
  attributes JSONB NOT NULL,
  required_views JSONB NOT NULL,
  automated_min_coverage NUMERIC(5,2) NOT NULL DEFAULT 90 CHECK (automated_min_coverage BETWEEN 0 AND 100),
  automated_min_confidence NUMERIC(5,2) NOT NULL DEFAULT 85 CHECK (automated_min_confidence BETWEEN 0 AND 100),
  maximum_media_count INT NOT NULL DEFAULT 12 CHECK (maximum_media_count BETWEEN 1 AND 50),
  session_validity_seconds INT NOT NULL DEFAULT 900 CHECK (session_validity_seconds BETWEEN 60 AND 3600),
  exception_types JSONB NOT NULL DEFAULT '["NON_MATERIAL","COSMETIC","GEOFENCE","SUPERVISED_CAPTURE"]'::jsonb,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  published_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id,category,subject_type,policy_version)
);

CREATE TABLE IF NOT EXISTS pv_cases (
  verification_case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  proc_case_line_id UUID NOT NULL REFERENCES proc_case_lines(proc_case_line_id) ON DELETE RESTRICT,
  acquisition_line_id UUID NOT NULL REFERENCES acq_lines(line_id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES proc_orders(order_id) ON DELETE RESTRICT,
  order_line_id UUID NOT NULL REFERENCES proc_order_lines(order_line_id) ON DELETE RESTRICT,
  receipt_id UUID NOT NULL REFERENCES proc_receipts(receipt_id) ON DELETE RESTRICT,
  receipt_line_id UUID NOT NULL UNIQUE REFERENCES proc_receipt_lines(receipt_line_id) ON DELETE RESTRICT,
  vendor_id UUID NOT NULL REFERENCES fin_vendors(vendor_id) ON DELETE RESTRICT,
  department_id INT REFERENCES departments(dept_id) ON DELETE SET NULL,
  source_event_id UUID NOT NULL REFERENCES proc_outbox_events(event_id) ON DELETE RESTRICT,
  subject_type VARCHAR(12) NOT NULL CHECK (subject_type IN ('ITEM','LOT')),
  eligible_quantity NUMERIC(12,3) NOT NULL CHECK (eligible_quantity > 0),
  unit_of_measure VARCHAR(40) NOT NULL,
  workflow_state VARCHAR(32) NOT NULL DEFAULT 'QUEUED' CHECK (workflow_state IN ('QUEUED','CAPTURING','ANALYZING','AWAITING_EVIDENCE','MANUAL_REVIEW','DECISION_PENDING','CLOSED','CANCELLED','SUPERSEDED')),
  aggregate_revision BIGINT NOT NULL DEFAULT 1 CHECK (aggregate_revision > 0),
  next_event_sequence BIGINT NOT NULL DEFAULT 1 CHECK (next_event_sequence > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pv_subjects (
  subject_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_case_id UUID NOT NULL REFERENCES pv_cases(verification_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  subject_type VARCHAR(12) NOT NULL CHECK (subject_type IN ('ITEM','LOT')),
  subject_sequence INT NOT NULL CHECK (subject_sequence > 0),
  subject_quantity NUMERIC(12,3) NOT NULL CHECK (subject_quantity > 0),
  unit_of_measure VARCHAR(40) NOT NULL,
  batch_number VARCHAR(160),
  expiry_date DATE,
  manufacture_date DATE,
  manufacturer VARCHAR(200),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RETURNED','REJECTED','SUPERSEDED','INACTIVE')),
  verification_revision BIGINT NOT NULL DEFAULT 1 CHECK (verification_revision > 0),
  created_by UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (verification_case_id,subject_sequence),
  CHECK ((subject_type='ITEM' AND subject_quantity=1 AND batch_number IS NULL) OR subject_type='LOT')
);

CREATE TABLE IF NOT EXISTS pv_invoice_allocations (
  invoice_allocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES pv_subjects(subject_id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES proc_invoices(invoice_id) ON DELETE RESTRICT,
  invoice_line_id UUID NOT NULL REFERENCES proc_invoice_lines(invoice_line_id) ON DELETE RESTRICT,
  integrity_case_id UUID NOT NULL REFERENCES inv_integrity_cases(integrity_case_id) ON DELETE RESTRICT,
  integrity_decision_id UUID NOT NULL REFERENCES inv_certifications(integrity_decision_id) ON DELETE RESTRICT,
  invoice_revision BIGINT NOT NULL,
  document_hash CHAR(64) NOT NULL,
  integrity_decision VARCHAR(32) NOT NULL,
  allocated_quantity NUMERIC(12,3) NOT NULL CHECK (allocated_quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subject_id,invoice_line_id,invoice_revision)
);

CREATE TABLE IF NOT EXISTS pv_reference_snapshots (
  reference_snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES pv_subjects(subject_id) ON DELETE RESTRICT,
  verification_policy_id UUID NOT NULL REFERENCES pv_verification_policies(verification_policy_id) ON DELETE RESTRICT,
  policy_version INT NOT NULL,
  acquisition_snapshot JSONB NOT NULL,
  order_snapshot JSONB NOT NULL,
  receipt_snapshot JSONB NOT NULL,
  invoice_snapshot JSONB NOT NULL,
  vendor_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  snapshot_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subject_id,snapshot_hash)
);

CREATE TABLE IF NOT EXISTS pv_capture_exceptions (
  capture_exception_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  verification_case_id UUID NOT NULL REFERENCES pv_cases(verification_case_id) ON DELETE RESTRICT,
  subject_id UUID NOT NULL REFERENCES pv_subjects(subject_id) ON DELETE RESTRICT,
  exception_type VARCHAR(32) NOT NULL CHECK (exception_type IN ('CAMERA_UNAVAILABLE','LOCATION_UNAVAILABLE','GEOFENCE','SUPERVISED_CAPTURE')),
  reason TEXT NOT NULL,
  issued_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pv_capture_sessions (
  capture_session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  verification_case_id UUID NOT NULL REFERENCES pv_cases(verification_case_id) ON DELETE RESTRICT,
  subject_id UUID NOT NULL REFERENCES pv_subjects(subject_id) ON DELETE RESTRICT,
  verification_policy_id UUID NOT NULL REFERENCES pv_verification_policies(verification_policy_id) ON DELETE RESTRICT,
  geofence_policy_id UUID NOT NULL REFERENCES pv_geofence_policies(geofence_policy_id) ON DELETE RESTRICT,
  policy_version INT NOT NULL,
  single_use_nonce_hash CHAR(64) NOT NULL UNIQUE,
  required_views JSONB NOT NULL,
  maximum_media_count INT NOT NULL,
  maximum_media_size BIGINT NOT NULL DEFAULT 10485760,
  capture_mode VARCHAR(20) NOT NULL DEFAULT 'LIVE' CHECK (capture_mode IN ('LIVE','SUPERVISED_EXCEPTION')),
  capture_exception_id UUID REFERENCES pv_capture_exceptions(capture_exception_id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','COMPLETED','EXPIRED','CANCELLED')),
  created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pv_evidence (
  evidence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  verification_case_id UUID NOT NULL REFERENCES pv_cases(verification_case_id) ON DELETE RESTRICT,
  subject_id UUID NOT NULL REFERENCES pv_subjects(subject_id) ON DELETE RESTRICT,
  capture_session_id UUID NOT NULL REFERENCES pv_capture_sessions(capture_session_id) ON DELETE RESTRICT,
  view_type VARCHAR(48) NOT NULL,
  media_type VARCHAR(12) NOT NULL CHECK (media_type IN ('IMAGE','VIDEO')),
  object_key TEXT NOT NULL,
  derivative_object_key TEXT,
  content_hash CHAR(64) NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size > 0),
  mime_type VARCHAR(80) NOT NULL,
  server_captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_captured_at TIMESTAMPTZ,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  accuracy_metres NUMERIC(8,2),
  geofence_result VARCHAR(24) NOT NULL CHECK (geofence_result IN ('SATISFIED','MISSING','LOW_ACCURACY','OUTSIDE','EXCEPTION')),
  captured_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  session_fingerprint_hash CHAR(64) NOT NULL,
  sanitized_device_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (object_key LIKE tenant_id::text || '/%'),
  CHECK (derivative_object_key IS NULL OR derivative_object_key LIKE tenant_id::text || '/%'),
  UNIQUE (tenant_id,content_hash)
);

CREATE TABLE IF NOT EXISTS pv_analyses (
  analysis_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  verification_case_id UUID NOT NULL REFERENCES pv_cases(verification_case_id) ON DELETE RESTRICT,
  subject_id UUID NOT NULL REFERENCES pv_subjects(subject_id) ON DELETE RESTRICT,
  reference_snapshot_id UUID NOT NULL REFERENCES pv_reference_snapshots(reference_snapshot_id) ON DELETE RESTRICT,
  verification_policy_id UUID NOT NULL REFERENCES pv_verification_policies(verification_policy_id) ON DELETE RESTRICT,
  policy_version INT NOT NULL,
  analysis_result VARCHAR(24) NOT NULL CHECK (analysis_result IN ('MATCHED','MINOR_DIFFERENCE','DISCREPANCY','INCONCLUSIVE','ANALYSIS_FAILED')),
  coverage_score NUMERIC(5,2) NOT NULL CHECK (coverage_score BETWEEN 0 AND 100),
  confidence_score NUMERIC(5,2) NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  deterministic_result JSONB NOT NULL,
  ai_model_version VARCHAR(120),
  ai_prompt_policy_version VARCHAR(80),
  ai_sanitized_input_hash CHAR(64),
  ai_output_hash CHAR(64),
  ai_confidence NUMERIC(5,2),
  ai_status VARCHAR(24) NOT NULL DEFAULT 'NOT_USED' CHECK (ai_status IN ('NOT_USED','SUCCEEDED','FAILED','REJECTED')),
  calculation_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pv_attribute_comparisons (
  comparison_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  analysis_id UUID NOT NULL REFERENCES pv_analyses(analysis_id) ON DELETE RESTRICT,
  subject_id UUID NOT NULL REFERENCES pv_subjects(subject_id) ON DELETE RESTRICT,
  attribute_name VARCHAR(120) NOT NULL,
  weight NUMERIC(8,3) NOT NULL CHECK (weight > 0),
  required BOOLEAN NOT NULL,
  hard_identifier BOOLEAN NOT NULL,
  expected_value JSONB,
  observed_value JSONB,
  extraction_method VARCHAR(48),
  extraction_confidence NUMERIC(5,2) CHECK (extraction_confidence BETWEEN 0 AND 100),
  outcome VARCHAR(24) NOT NULL CHECK (outcome IN ('MATCHED','MISMATCHED','UNKNOWN','NOT_APPLICABLE')),
  tolerance JSONB,
  comparison_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (analysis_id,attribute_name)
);

CREATE TABLE IF NOT EXISTS pv_blockers (
  blocker_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  verification_case_id UUID NOT NULL REFERENCES pv_cases(verification_case_id) ON DELETE RESTRICT,
  subject_id UUID NOT NULL REFERENCES pv_subjects(subject_id) ON DELETE RESTRICT,
  blocker_type VARCHAR(48) NOT NULL,
  severity VARCHAR(16) NOT NULL CHECK (severity IN ('REVIEWABLE','NON_OVERRIDABLE','MATERIAL')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pv_decisions (
  verification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  verification_case_id UUID NOT NULL REFERENCES pv_cases(verification_case_id) ON DELETE RESTRICT,
  subject_id UUID NOT NULL REFERENCES pv_subjects(subject_id) ON DELETE RESTRICT,
  verification_revision BIGINT NOT NULL,
  analysis_id UUID NOT NULL REFERENCES pv_analyses(analysis_id) ON DELETE RESTRICT,
  final_decision VARCHAR(32) NOT NULL CHECK (final_decision IN ('CLEARED_AUTOMATED','CLEARED_HUMAN','ACCEPTED_EXCEPTION','REJECTED')),
  trust_level VARCHAR(32) NOT NULL CHECK (trust_level IN ('AUTOMATED_VERIFIED','HUMAN_VERIFIED','EXCEPTION_ACCEPTED','UNVERIFIED')),
  capturer_id UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  reviewer_id UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  exception_approver_id UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  decision_reason TEXT NOT NULL,
  verification_record_hash CHAR(64) NOT NULL,
  evidence_manifest_hash CHAR(64) NOT NULL,
  reference_snapshot_hash CHAR(64) NOT NULL,
  previous_decision_hash CHAR(64),
  decision_hash CHAR(64) NOT NULL UNIQUE,
  supersedes_verification_id UUID REFERENCES pv_decisions(verification_id) ON DELETE RESTRICT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reviewer_id IS NULL OR capturer_id IS NULL OR reviewer_id<>capturer_id),
  CHECK (exception_approver_id IS NULL OR reviewer_id IS NULL OR exception_approver_id<>reviewer_id)
);

CREATE TABLE IF NOT EXISTS pv_blocker_resolutions (
  blocker_resolution_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  verification_case_id UUID NOT NULL REFERENCES pv_cases(verification_case_id) ON DELETE RESTRICT,
  subject_id UUID NOT NULL REFERENCES pv_subjects(subject_id) ON DELETE RESTRICT,
  blocker_id UUID NOT NULL REFERENCES pv_blockers(blocker_id) ON DELETE RESTRICT,
  verification_id UUID NOT NULL REFERENCES pv_decisions(verification_id) ON DELETE RESTRICT,
  resolved_by UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  resolution_reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blocker_id,verification_id)
);

CREATE TABLE IF NOT EXISTS pv_review_recommendations (
  review_recommendation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  verification_case_id UUID NOT NULL REFERENCES pv_cases(verification_case_id) ON DELETE RESTRICT,
  subject_id UUID NOT NULL REFERENCES pv_subjects(subject_id) ON DELETE RESTRICT,
  analysis_id UUID NOT NULL REFERENCES pv_analyses(analysis_id) ON DELETE RESTRICT,
  reviewer_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  recommendation VARCHAR(32) NOT NULL CHECK (recommendation IN ('CLEAR','REJECT','REQUEST_EVIDENCE','REQUEST_EXCEPTION')),
  reason TEXT NOT NULL,
  exception_type VARCHAR(32),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED','SUPERSEDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pv_verification_identities (
  verification_identity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  verification_id UUID NOT NULL UNIQUE REFERENCES pv_decisions(verification_id) ON DELETE RESTRICT,
  subject_id UUID NOT NULL REFERENCES pv_subjects(subject_id) ON DELETE RESTRICT,
  verification_revision BIGINT NOT NULL,
  verification_code VARCHAR(64) NOT NULL,
  verification_record_hash CHAR(64) NOT NULL,
  evidence_manifest_hash CHAR(64) NOT NULL,
  signature_algorithm VARCHAR(16) NOT NULL DEFAULT 'Ed25519' CHECK (signature_algorithm='Ed25519'),
  signing_key_version VARCHAR(80) NOT NULL,
  signature TEXT NOT NULL,
  signed_payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED','SUPERSEDED','EXPIRED')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  superseded_by UUID REFERENCES pv_verification_identities(verification_identity_id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,verification_code)
);

CREATE TABLE IF NOT EXISTS pv_inventory_identity_projections (
  inventory_projection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES pv_subjects(subject_id) ON DELETE RESTRICT,
  verification_identity_id UUID NOT NULL REFERENCES pv_verification_identities(verification_identity_id) ON DELETE RESTRICT,
  source_event_id UUID NOT NULL UNIQUE,
  rfid VARCHAR(160),
  university_serial VARCHAR(160),
  asset_id VARCHAR(160),
  inventory_record_id VARCHAR(160),
  source_aggregate_sequence BIGINT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pv_audit_events (
  audit_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  verification_case_id UUID NOT NULL REFERENCES pv_cases(verification_case_id) ON DELETE RESTRICT,
  subject_id UUID REFERENCES pv_subjects(subject_id) ON DELETE RESTRICT,
  entity_type VARCHAR(40) NOT NULL,
  entity_id UUID NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  actor_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  previous_values JSONB,
  new_values JSONB,
  case_revision BIGINT NOT NULL,
  previous_event_hash CHAR(64),
  event_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pv_outbox_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  verification_case_id UUID NOT NULL REFERENCES pv_cases(verification_case_id) ON DELETE RESTRICT,
  subject_id UUID REFERENCES pv_subjects(subject_id) ON DELETE RESTRICT,
  aggregate_id UUID NOT NULL,
  aggregate_revision BIGINT NOT NULL,
  aggregate_sequence BIGINT NOT NULL,
  event_type VARCHAR(96) NOT NULL,
  event_version INT NOT NULL DEFAULT 1,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','PUBLISHED','FAILED')),
  attempts INT NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (aggregate_id,aggregate_sequence)
);

CREATE TABLE IF NOT EXISTS pv_idempotency (
  idempotency_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  actor_id VARCHAR(160) NOT NULL,
  idempotency_key VARCHAR(160) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '24 hours',
  UNIQUE (tenant_id,actor_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS pv_consumed_events (
  event_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  event_type VARCHAR(96) NOT NULL,
  verification_case_id UUID REFERENCES pv_cases(verification_case_id) ON DELETE RESTRICT,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proc_physical_verification_event_consumption (
  event_id UUID PRIMARY KEY REFERENCES pv_outbox_events(event_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  proc_case_line_id UUID NOT NULL REFERENCES proc_case_lines(proc_case_line_id) ON DELETE RESTRICT,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pv_cases_scope ON pv_cases(tenant_id,department_id,workflow_state,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pv_subjects_case ON pv_subjects(verification_case_id,status,subject_sequence);
CREATE INDEX IF NOT EXISTS idx_pv_evidence_subject ON pv_evidence(subject_id,created_at);
CREATE INDEX IF NOT EXISTS idx_pv_outbox_pending ON pv_outbox_events(status,available_at) WHERE status IN ('PENDING','FAILED');
CREATE UNIQUE INDEX IF NOT EXISTS idx_pv_one_active_identity ON pv_verification_identities(subject_id) WHERE status='ACTIVE';

CREATE OR REPLACE FUNCTION pv_block_append_only_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PRODUCT_VERIFICATION_IMMUTABLE: append-only record cannot be changed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_pv_evidence_immutable BEFORE UPDATE OR DELETE ON pv_evidence FOR EACH ROW EXECUTE FUNCTION pv_block_append_only_mutation();
CREATE TRIGGER tr_pv_analysis_immutable BEFORE UPDATE OR DELETE ON pv_analyses FOR EACH ROW EXECUTE FUNCTION pv_block_append_only_mutation();
CREATE TRIGGER tr_pv_comparison_immutable BEFORE UPDATE OR DELETE ON pv_attribute_comparisons FOR EACH ROW EXECUTE FUNCTION pv_block_append_only_mutation();
CREATE TRIGGER tr_pv_blocker_immutable BEFORE UPDATE OR DELETE ON pv_blockers FOR EACH ROW EXECUTE FUNCTION pv_block_append_only_mutation();
CREATE TRIGGER tr_pv_blocker_resolution_immutable BEFORE UPDATE OR DELETE ON pv_blocker_resolutions FOR EACH ROW EXECUTE FUNCTION pv_block_append_only_mutation();
CREATE TRIGGER tr_pv_decision_immutable BEFORE UPDATE OR DELETE ON pv_decisions FOR EACH ROW EXECUTE FUNCTION pv_block_append_only_mutation();
CREATE TRIGGER tr_pv_review_immutable BEFORE DELETE ON pv_review_recommendations FOR EACH ROW EXECUTE FUNCTION pv_block_append_only_mutation();
CREATE TRIGGER tr_pv_audit_immutable BEFORE UPDATE OR DELETE ON pv_audit_events FOR EACH ROW EXECUTE FUNCTION pv_block_append_only_mutation();

DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT tenant_id FROM tenants LOOP
    INSERT INTO pv_verification_policies
      (tenant_id,category,subject_type,policy_version,status,attributes,required_views,published_at)
    VALUES
      (t.tenant_id,'*','ITEM',1,'PUBLISHED',
       '[{"attribute_name":"brand","weight":15,"required":true,"hard_identifier":false,"comparison_method":"NORMALIZED_EXACT","normalization_rule":"CASEFOLD_TRIM","ai_mode":"OPTIONAL"},{"attribute_name":"model","weight":30,"required":true,"hard_identifier":true,"comparison_method":"NORMALIZED_EXACT","normalization_rule":"CASEFOLD_TRIM","ai_mode":"OPTIONAL"},{"attribute_name":"serial","weight":25,"required":true,"hard_identifier":true,"comparison_method":"PRESENT_UNIQUE","normalization_rule":"CASEFOLD_TRIM","ai_mode":"DISABLED"},{"attribute_name":"technical_specifications","weight":20,"required":true,"hard_identifier":false,"comparison_method":"STRUCTURED","normalization_rule":"CANONICAL_JSON","ai_mode":"REQUIRED_FOR_AUTOMATION"},{"attribute_name":"quantity","weight":10,"required":true,"hard_identifier":true,"comparison_method":"NUMERIC_EXACT","normalization_rule":"DECIMAL","ai_mode":"DISABLED"}]'::jsonb,
       '["OVERVIEW","MANUFACTURER_LABEL"]'::jsonb,NOW()),
      (t.tenant_id,'*','LOT',1,'PUBLISHED',
       '[{"attribute_name":"brand","weight":15,"required":true,"hard_identifier":false,"comparison_method":"NORMALIZED_EXACT","normalization_rule":"CASEFOLD_TRIM","ai_mode":"OPTIONAL"},{"attribute_name":"batch_number","weight":25,"required":true,"hard_identifier":true,"comparison_method":"NORMALIZED_EXACT","normalization_rule":"CASEFOLD_TRIM","ai_mode":"DISABLED"},{"attribute_name":"expiry_date","weight":15,"required":false,"hard_identifier":false,"comparison_method":"DATE","normalization_rule":"ISO_DATE","ai_mode":"DISABLED"},{"attribute_name":"specifications","weight":20,"required":true,"hard_identifier":false,"comparison_method":"STRUCTURED","normalization_rule":"CANONICAL_JSON","ai_mode":"REQUIRED_FOR_AUTOMATION"},{"attribute_name":"quantity","weight":25,"required":true,"hard_identifier":true,"comparison_method":"NUMERIC_EXACT","normalization_rule":"DECIMAL","ai_mode":"DISABLED"}]'::jsonb,
       '["OVERVIEW","BATCH_EXPIRY_LABEL","QUANTITY_EVIDENCE"]'::jsonb,NOW())
    ON CONFLICT (tenant_id,category,subject_type,policy_version) DO NOTHING;

    INSERT INTO acq_access_grants (tenant_id,principal_role,capability,scope_type)
    SELECT t.tenant_id,x.role_name,x.capability,'TENANT'
    FROM (VALUES
      ('ReceivingClerk','PRODUCT_VERIFICATION_VIEW'),('ReceivingClerk','PRODUCT_VERIFICATION_CAPTURE'),
      ('Stores','PRODUCT_VERIFICATION_VIEW'),('Stores','PRODUCT_VERIFICATION_CAPTURE'),('Stores','PRODUCT_VERIFICATION_REVIEW'),
      ('ProcurementHead','PRODUCT_VERIFICATION_VIEW'),('ProcurementHead','PRODUCT_VERIFICATION_EXCEPTION_APPROVE'),
      ('InternalAuditor','PRODUCT_VERIFICATION_VIEW'),('InternalAuditor','PRODUCT_VERIFICATION_AUDIT'),
      ('SuperAdmin','PRODUCT_VERIFICATION_VIEW'),('SuperAdmin','PRODUCT_VERIFICATION_CAPTURE'),
      ('SuperAdmin','PRODUCT_VERIFICATION_ANALYZE'),('SuperAdmin','PRODUCT_VERIFICATION_REVIEW'),
      ('SuperAdmin','PRODUCT_VERIFICATION_EXCEPTION_APPROVE'),('SuperAdmin','PRODUCT_VERIFICATION_POLICY_ADMIN'),
      ('SuperAdmin','PRODUCT_VERIFICATION_AUDIT')
    ) AS x(role_name,capability)
    WHERE NOT EXISTS (
      SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=t.tenant_id
        AND g.principal_role=x.role_name AND g.capability=x.capability AND g.scope_type='TENANT'
    );
  END LOOP;
END $$;

INSERT INTO tenant_subscriptions (tenant_id,feature_key,is_enabled)
SELECT tenant_id,'dofa_module4_product_verification',false FROM tenants
ON CONFLICT (tenant_id,feature_key) DO NOTHING;
INSERT INTO tenant_subscriptions (tenant_id,feature_key,is_enabled)
SELECT tenant_id,'dofa_module4_inventory_gate',false FROM tenants
ON CONFLICT (tenant_id,feature_key) DO NOTHING;

-- Existing finalized cases remain historical. Only open physical-goods lines are gated.
UPDATE proc_case_lines pcl SET requires_physical_verification=true
FROM proc_cases pc
WHERE pc.proc_case_id=pcl.proc_case_id AND pc.status<>'FINALIZED'
  AND pcl.fulfillment_type IN ('ASSET','CONSUMABLE');

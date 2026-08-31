-- DoFA Module 3: server-side invoice integrity, evidence, investigation, and clearance

ALTER TABLE proc_invoices
  ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(32) NOT NULL DEFAULT 'ONLINE_INSTITUTIONAL',
  ADD COLUMN IF NOT EXISTS integrity_status VARCHAR(32) NOT NULL DEFAULT 'NOT_STARTED';

ALTER TABLE proc_invoices DROP CONSTRAINT IF EXISTS proc_invoices_status_check;
ALTER TABLE proc_invoices ADD CONSTRAINT proc_invoices_status_check CHECK (
  status IN ('PENDING','ENTERED','INTEGRITY_REVIEW','VERIFIED','DISPUTED','PARTIALLY_PAID','PAID','VOID','FINALIZED')
);

ALTER TABLE proc_invoices ADD CONSTRAINT proc_invoice_type_check CHECK (
  invoice_type IN ('ONLINE_INSTITUTIONAL','ONLINE_PERSONAL_EXCEPTION','OFFLINE_PRINTED','OFFLINE_HANDWRITTEN')
);

ALTER TABLE proc_invoices ADD CONSTRAINT proc_invoice_integrity_status_check CHECK (
  integrity_status IN ('NOT_STARTED','PENDING','CLEARED','REJECTED','SUPERSEDED','LEGACY_VERIFICATION')
);

CREATE TABLE IF NOT EXISTS inv_integrity_policies (
  integrity_policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  policy_version INT NOT NULL CHECK (policy_version > 0),
  category VARCHAR(120) NOT NULL DEFAULT '*',
  invoice_type VARCHAR(32) NOT NULL DEFAULT '*',
  status VARCHAR(20) NOT NULL CHECK (status IN ('DRAFT','PUBLISHED','SUPERSEDED')),
  factor_weights JSONB NOT NULL,
  low_risk_max NUMERIC(5,2) NOT NULL DEFAULT 29,
  medium_risk_max NUMERIC(5,2) NOT NULL DEFAULT 59,
  automated_min_coverage NUMERIC(5,2) NOT NULL DEFAULT 90,
  automated_min_confidence NUMERIC(5,2) NOT NULL DEFAULT 80,
  rounding_tolerance_amount NUMERIC(15,2) NOT NULL DEFAULT 1,
  rounding_tolerance_percent NUMERIC(8,4) NOT NULL DEFAULT 0.1,
  required_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  published_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id,category,invoice_type,policy_version)
);

CREATE TABLE IF NOT EXISTS inv_source_accounts (
  source_account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  department_id INT REFERENCES departments(dept_id) ON DELETE SET NULL,
  platform VARCHAR(80) NOT NULL,
  account_label VARCHAR(160) NOT NULL,
  external_account_reference VARCHAR(200) NOT NULL,
  secret_reference TEXT,
  allowed_domains JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_methods JSONB NOT NULL DEFAULT '["API_OAUTH","PLATFORM_EXPORT","ATTENDED_BROWSER"]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED','REAUTH_REQUIRED')),
  created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id,platform,external_account_reference)
);

CREATE TABLE IF NOT EXISTS inv_integrity_cases (
  integrity_case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES proc_invoices(invoice_id) ON DELETE RESTRICT,
  invoice_revision BIGINT NOT NULL CHECK (invoice_revision > 0),
  document_hash CHAR(64) NOT NULL,
  invoice_type VARCHAR(32) NOT NULL,
  source_event_id UUID NOT NULL UNIQUE REFERENCES proc_outbox_events(event_id) ON DELETE RESTRICT,
  invoice_submitter_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  department_id INT REFERENCES departments(dept_id) ON DELETE SET NULL,
  workflow_state VARCHAR(32) NOT NULL DEFAULT 'QUEUED' CHECK (
    workflow_state IN ('QUEUED','ANALYZING','AWAITING_EVIDENCE','MANUAL_REVIEW','DECISION_PENDING','CLOSED','CANCELLED','SUPERSEDED')
  ),
  analysis_result VARCHAR(32) CHECK (
    analysis_result IS NULL OR analysis_result IN ('SOURCE_MATCHED','MINOR_DIFFERENCE','POTENTIAL_DISCREPANCY','SOURCE_UNAVAILABLE','OFFLINE_ANALYZED','ANALYSIS_FAILED')
  ),
  final_decision VARCHAR(32) CHECK (
    final_decision IS NULL OR final_decision IN ('CLEARED_AUTOMATED','CLEARED_HUMAN','REJECTED_UNRESOLVED')
  ),
  trust_level VARCHAR(32) NOT NULL DEFAULT 'UNVERIFIED' CHECK (
    trust_level IN ('SOURCE_VERIFIED','HUMAN_VERIFIED','PARTIALLY_VERIFIED','ANALYZED_ONLY','UNVERIFIED')
  ),
  aggregate_revision BIGINT NOT NULL DEFAULT 1 CHECK (aggregate_revision > 0),
  next_event_sequence BIGINT NOT NULL DEFAULT 1 CHECK (next_event_sequence > 0),
  supersedes_case_id UUID REFERENCES inv_integrity_cases(integrity_case_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  UNIQUE (invoice_id,invoice_revision,document_hash)
);

CREATE TABLE IF NOT EXISTS inv_integrity_step_up_challenges (
  challenge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  integrity_case_id UUID NOT NULL REFERENCES inv_integrity_cases(integrity_case_id) ON DELETE CASCADE,
  purpose VARCHAR(32) NOT NULL CHECK (purpose IN ('ATTENDED_RETRIEVAL','CERTIFICATION')),
  otp_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  failed_attempts INT NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inv_retrieval_attempts (
  retrieval_attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrity_case_id UUID NOT NULL REFERENCES inv_integrity_cases(integrity_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  source_account_id UUID REFERENCES inv_source_accounts(source_account_id) ON DELETE RESTRICT,
  retrieval_method VARCHAR(32) NOT NULL CHECK (retrieval_method IN ('API_OAUTH','PLATFORM_EXPORT','ATTENDED_BROWSER','MANUAL_ORIGINAL_UPLOAD','VENDOR_CONFIRMATION')),
  target_order_id VARCHAR(200),
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','SUCCEEDED','FAILED','EXPIRED','CANCELLED')),
  requested_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  failure_code VARCHAR(80),
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS inv_attended_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  integrity_case_id UUID NOT NULL REFERENCES inv_integrity_cases(integrity_case_id) ON DELETE RESTRICT,
  retrieval_attempt_id UUID NOT NULL UNIQUE REFERENCES inv_retrieval_attempts(retrieval_attempt_id) ON DELETE RESTRICT,
  operator_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  source_account_id UUID NOT NULL REFERENCES inv_source_accounts(source_account_id) ON DELETE RESTRICT,
  platform VARCHAR(80) NOT NULL,
  target_order_id VARCHAR(200) NOT NULL,
  browser_profile_id UUID NOT NULL UNIQUE,
  status VARCHAR(24) NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED','ACTIVE','COMPLETED','FAILED','EXPIRED','CANCELLED')),
  step_up_verified_at TIMESTAMPTZ NOT NULL,
  operator_present_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  profile_destroyed_at TIMESTAMPTZ,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inv_source_snapshots (
  source_snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrity_case_id UUID NOT NULL REFERENCES inv_integrity_cases(integrity_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  source_platform VARCHAR(80) NOT NULL,
  source_account_id UUID NOT NULL REFERENCES inv_source_accounts(source_account_id) ON DELETE RESTRICT,
  external_transaction_id VARCHAR(240) NOT NULL,
  source_revision VARCHAR(120),
  retrieval_method VARCHAR(32) NOT NULL,
  retrieval_attempt_id UUID REFERENCES inv_retrieval_attempts(retrieval_attempt_id) ON DELETE RESTRICT,
  retrieved_at TIMESTAMPTZ NOT NULL,
  retrieved_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  payload JSONB NOT NULL,
  content_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id,source_platform,source_account_id,external_transaction_id,content_hash)
);

CREATE TABLE IF NOT EXISTS inv_evidence (
  evidence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrity_case_id UUID NOT NULL REFERENCES inv_integrity_cases(integrity_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  evidence_type VARCHAR(48) NOT NULL,
  source_method VARCHAR(32) NOT NULL,
  object_key TEXT,
  source_reference TEXT,
  content_hash CHAR(64) NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  captured_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  retrieval_attempt_id UUID REFERENCES inv_retrieval_attempts(retrieval_attempt_id) ON DELETE RESTRICT,
  retention_class VARCHAR(32) NOT NULL DEFAULT 'FINANCIAL_RECORD',
  legal_hold BOOLEAN NOT NULL DEFAULT false,
  supersedes_evidence_id UUID REFERENCES inv_evidence(evidence_id) ON DELETE RESTRICT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (object_key IS NULL OR object_key LIKE tenant_id::text || '/%'),
  CHECK (object_key IS NOT NULL OR source_reference IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS inv_document_analyses (
  document_analysis_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrity_case_id UUID NOT NULL REFERENCES inv_integrity_cases(integrity_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  document_hash CHAR(64) NOT NULL,
  parser_version VARCHAR(80) NOT NULL,
  extracted_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  field_confidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  forensic_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  deterministic_result JSONB NOT NULL,
  ai_model_version VARCHAR(120),
  ai_prompt_policy_version VARCHAR(80),
  ai_sanitized_input_hash CHAR(64),
  ai_output_hash CHAR(64),
  ai_confidence NUMERIC(5,2),
  ai_status VARCHAR(20) CHECK (ai_status IS NULL OR ai_status IN ('NOT_USED','SUCCEEDED','FAILED','REJECTED')),
  result_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inv_field_comparisons (
  comparison_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrity_case_id UUID NOT NULL REFERENCES inv_integrity_cases(integrity_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  source_snapshot_id UUID REFERENCES inv_source_snapshots(source_snapshot_id) ON DELETE RESTRICT,
  integrity_policy_id UUID NOT NULL REFERENCES inv_integrity_policies(integrity_policy_id) ON DELETE RESTRICT,
  policy_version INT NOT NULL,
  dimensions JSONB NOT NULL,
  analysis_result VARCHAR(32) NOT NULL,
  comparison_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inv_market_observations (
  market_observation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrity_case_id UUID NOT NULL REFERENCES inv_integrity_cases(integrity_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  source VARCHAR(160) NOT NULL,
  source_url_or_reference TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  applicable_purchase_date DATE,
  observed_price NUMERIC(15,2) NOT NULL CHECK (observed_price >= 0),
  currency CHAR(3) NOT NULL,
  product_identifier VARCHAR(240) NOT NULL,
  variant VARCHAR(240),
  condition VARCHAR(40),
  availability VARCHAR(80),
  shipping_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0),
  tax_included BOOLEAN,
  content_hash CHAR(64) NOT NULL,
  captured_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inv_risk_assessments (
  risk_assessment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrity_case_id UUID NOT NULL REFERENCES inv_integrity_cases(integrity_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  integrity_policy_id UUID NOT NULL REFERENCES inv_integrity_policies(integrity_policy_id) ON DELETE RESTRICT,
  policy_version INT NOT NULL,
  factors JSONB NOT NULL,
  risk_score NUMERIC(5,2) NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  coverage_score NUMERIC(5,2) NOT NULL CHECK (coverage_score BETWEEN 0 AND 100),
  confidence_score NUMERIC(5,2) NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  risk_band VARCHAR(16) NOT NULL CHECK (risk_band IN ('LOW','MEDIUM','HIGH')),
  automated_clearance_eligible BOOLEAN NOT NULL DEFAULT false,
  assessment_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inv_integrity_blockers (
  blocker_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrity_case_id UUID NOT NULL REFERENCES inv_integrity_cases(integrity_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  blocker_type VARCHAR(48) NOT NULL CHECK (blocker_type IN ('VENDOR_IDENTITY_MISMATCH','ORDER_IDENTITY_MISMATCH','CURRENCY_MISMATCH','DUPLICATE_TRANSACTION','DOCUMENT_REPLACEMENT','SOURCE_ACCOUNT_MISMATCH','TENANT_MISMATCH','MATERIAL_AMOUNT_DIFFERENCE','UNTRUSTED_SOURCE','SOURCE_PAYLOAD_INVALID')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (integrity_case_id,blocker_type,source_id)
);

-- Blockers remain immutable. A human clearance addresses them through a separate,
-- append-only resolution record instead of mutating or deleting the finding.
CREATE TABLE IF NOT EXISTS inv_integrity_blocker_resolutions (
  blocker_resolution_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES inv_integrity_blockers(blocker_id) ON DELETE RESTRICT,
  integrity_case_id UUID NOT NULL REFERENCES inv_integrity_cases(integrity_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  integrity_decision_id UUID NOT NULL,
  resolved_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  resolution_reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blocker_id,integrity_decision_id)
);

CREATE TABLE IF NOT EXISTS inv_evidence_requests (
  evidence_request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrity_case_id UUID NOT NULL REFERENCES inv_integrity_cases(integrity_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  requested_from UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  requested_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  public_reason VARCHAR(500) NOT NULL,
  requested_evidence_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESPONDED','ACCEPTED','CANCELLED','EXPIRED')),
  response_text TEXT,
  responded_by UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  responded_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inv_investigations (
  investigation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrity_case_id UUID NOT NULL REFERENCES inv_integrity_cases(integrity_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  investigator_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  status VARCHAR(24) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','EVIDENCE_PENDING','RECOMMENDED','CLOSED','CANCELLED')),
  restricted_notes TEXT,
  recommendation VARCHAR(32) CHECK (recommendation IS NULL OR recommendation IN ('CLEAR','REJECT','REQUEST_MORE_EVIDENCE')),
  recommendation_reason TEXT,
  recommended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inv_certifications (
  integrity_decision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrity_case_id UUID NOT NULL REFERENCES inv_integrity_cases(integrity_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES proc_invoices(invoice_id) ON DELETE RESTRICT,
  invoice_revision BIGINT NOT NULL,
  document_hash CHAR(64) NOT NULL,
  evidence_set_hash CHAR(64) NOT NULL,
  risk_assessment_id UUID NOT NULL REFERENCES inv_risk_assessments(risk_assessment_id) ON DELETE RESTRICT,
  integrity_policy_id UUID NOT NULL REFERENCES inv_integrity_policies(integrity_policy_id) ON DELETE RESTRICT,
  policy_version INT NOT NULL,
  investigation_id UUID REFERENCES inv_investigations(investigation_id) ON DELETE RESTRICT,
  investigator_id UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  certifier_id UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  decision VARCHAR(32) NOT NULL CHECK (decision IN ('CLEARED_AUTOMATED','CLEARED_HUMAN','REJECTED_UNRESOLVED')),
  trust_level VARCHAR(32) NOT NULL,
  decision_reason TEXT NOT NULL,
  supersedes_decision_id UUID REFERENCES inv_certifications(integrity_decision_id) ON DELETE RESTRICT,
  previous_decision_hash CHAR(64),
  decision_hash CHAR(64) NOT NULL UNIQUE,
  certified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (decision='CLEARED_AUTOMATED' OR (investigator_id IS NOT NULL AND certifier_id IS NOT NULL AND investigator_id<>certifier_id))
);

ALTER TABLE inv_integrity_blocker_resolutions
  ADD CONSTRAINT inv_blocker_resolution_decision_fk
  FOREIGN KEY (integrity_decision_id)
  REFERENCES inv_certifications(integrity_decision_id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS proc_invoice_integrity_projections (
  invoice_id UUID PRIMARY KEY REFERENCES proc_invoices(invoice_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  integrity_case_id UUID NOT NULL REFERENCES inv_integrity_cases(integrity_case_id) ON DELETE RESTRICT,
  integrity_decision_id UUID NOT NULL REFERENCES inv_certifications(integrity_decision_id) ON DELETE RESTRICT,
  invoice_revision BIGINT NOT NULL,
  document_hash CHAR(64) NOT NULL,
  final_decision VARCHAR(32) NOT NULL,
  trust_level VARCHAR(32) NOT NULL,
  policy_version INT NOT NULL,
  evidence_set_hash CHAR(64) NOT NULL,
  decision_hash CHAR(64) NOT NULL,
  cleared_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  payment_eligible BOOLEAN NOT NULL DEFAULT false,
  applied_source_event_id UUID UNIQUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proc_integrity_event_consumption (
  event_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES proc_invoices(invoice_id) ON DELETE CASCADE,
  event_type VARCHAR(80) NOT NULL,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inv_integrity_audit_events (
  audit_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrity_case_id UUID NOT NULL REFERENCES inv_integrity_cases(integrity_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS inv_integrity_outbox_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  integrity_case_id UUID NOT NULL REFERENCES inv_integrity_cases(integrity_case_id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES proc_invoices(invoice_id) ON DELETE RESTRICT,
  invoice_revision BIGINT NOT NULL,
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

CREATE TABLE IF NOT EXISTS inv_integrity_idempotency (
  idempotency_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  actor_id VARCHAR(160) NOT NULL,
  idempotency_key VARCHAR(160) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  response_payload JSONB,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '24 hours',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id,actor_id,idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_inv_integrity_case_scope ON inv_integrity_cases(tenant_id,department_id,workflow_state,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_integrity_invoice ON inv_integrity_cases(invoice_id,invoice_revision);
CREATE INDEX IF NOT EXISTS idx_inv_integrity_evidence ON inv_evidence(integrity_case_id,created_at,evidence_id);
CREATE INDEX IF NOT EXISTS idx_inv_integrity_outbox ON inv_integrity_outbox_events(status,available_at) WHERE status IN ('PENDING','FAILED');

CREATE OR REPLACE FUNCTION inv_block_immutable_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'INVOICE_INTEGRITY_IMMUTABLE: create a superseding record';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_inv_snapshot_immutable BEFORE UPDATE OR DELETE ON inv_source_snapshots FOR EACH ROW EXECUTE FUNCTION inv_block_immutable_mutation();
CREATE TRIGGER tr_inv_evidence_immutable BEFORE UPDATE OR DELETE ON inv_evidence FOR EACH ROW EXECUTE FUNCTION inv_block_immutable_mutation();
CREATE TRIGGER tr_inv_analysis_immutable BEFORE UPDATE OR DELETE ON inv_document_analyses FOR EACH ROW EXECUTE FUNCTION inv_block_immutable_mutation();
CREATE TRIGGER tr_inv_comparison_immutable BEFORE UPDATE OR DELETE ON inv_field_comparisons FOR EACH ROW EXECUTE FUNCTION inv_block_immutable_mutation();
CREATE TRIGGER tr_inv_risk_immutable BEFORE UPDATE OR DELETE ON inv_risk_assessments FOR EACH ROW EXECUTE FUNCTION inv_block_immutable_mutation();
CREATE TRIGGER tr_inv_blocker_immutable BEFORE UPDATE OR DELETE ON inv_integrity_blockers FOR EACH ROW EXECUTE FUNCTION inv_block_immutable_mutation();
CREATE TRIGGER tr_inv_blocker_resolution_immutable BEFORE UPDATE OR DELETE ON inv_integrity_blocker_resolutions FOR EACH ROW EXECUTE FUNCTION inv_block_immutable_mutation();
CREATE TRIGGER tr_inv_certification_immutable BEFORE UPDATE OR DELETE ON inv_certifications FOR EACH ROW EXECUTE FUNCTION inv_block_immutable_mutation();
CREATE TRIGGER tr_inv_audit_immutable BEFORE UPDATE OR DELETE ON inv_integrity_audit_events FOR EACH ROW EXECUTE FUNCTION inv_block_immutable_mutation();

DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT tenant_id FROM tenants LOOP
    INSERT INTO inv_integrity_policies (
      tenant_id,policy_version,category,invoice_type,status,factor_weights,
      required_evidence,published_at
    ) VALUES (
      t.tenant_id,1,'*','*','PUBLISHED',
      '{"SOURCE_DISCREPANCY":25,"PRICE_DEVIATION":25,"DOCUMENT_ANOMALY":15,"PRODUCT_ORDER_MISMATCH":10,"VENDOR_HISTORY":10,"MISSING_EVIDENCE":5,"PURCHASING_PATTERN":5,"REPEATED_DISCREPANCIES":5}'::jsonb,
      '["ORIGINAL_INVOICE"]'::jsonb,NOW()
    ) ON CONFLICT (tenant_id,category,invoice_type,policy_version) DO NOTHING;

    INSERT INTO acq_access_grants (tenant_id,principal_role,capability,scope_type)
    SELECT t.tenant_id,x.role_name,x.capability,'TENANT'
    FROM (VALUES
      ('Faculty','INVOICE_INTEGRITY_VIEW'),('HOD','INVOICE_INTEGRITY_VIEW'),
      ('APClerk','INVOICE_INTEGRITY_VIEW'),('APManager','INVOICE_INTEGRITY_INVESTIGATE'),
      ('FinanceController','INVOICE_INTEGRITY_CERTIFY'),('CFO','INVOICE_INTEGRITY_CERTIFY'),
      ('ProcurementHead','INVOICE_SOURCE_RETRIEVE'),('FinanceController','INVOICE_SOURCE_MANAGE'),
      ('InternalAuditor','INVOICE_INTEGRITY_AUDIT'),('SuperAdmin','INVOICE_INTEGRITY_AUDIT'),
      ('SuperAdmin','INVOICE_SOURCE_MANAGE'),('SuperAdmin','INVOICE_SOURCE_RETRIEVE'),
      ('SuperAdmin','INVOICE_INTEGRITY_ANALYZE'),('SuperAdmin','INVOICE_INTEGRITY_INVESTIGATE'),
      ('SuperAdmin','INVOICE_INTEGRITY_CERTIFY'),('SuperAdmin','INVOICE_INTEGRITY_POLICY_ADMIN')
    ) AS x(role_name,capability)
    WHERE NOT EXISTS (
      SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=t.tenant_id
        AND g.principal_role=x.role_name AND g.capability=x.capability AND g.scope_type='TENANT'
    );
  END LOOP;
END $$;

INSERT INTO tenant_subscriptions (tenant_id,feature_key,is_enabled)
SELECT tenant_id,'dofa_module3_invoice_integrity',false FROM tenants
ON CONFLICT (tenant_id,feature_key) DO NOTHING;

INSERT INTO tenant_subscriptions (tenant_id,feature_key,is_enabled)
SELECT tenant_id,'dofa_module3_payment_gate',false FROM tenants
ON CONFLICT (tenant_id,feature_key) DO NOTHING;

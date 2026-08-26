-- DOFA Module 1: secure, versioned Digital Acquisition Requests

CREATE TABLE IF NOT EXISTS acq_requests (
  acquisition_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  acquisition_number VARCHAR(32) NOT NULL,
  requester_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  requesting_department_id INT REFERENCES departments(dept_id) ON DELETE SET NULL,
  source VARCHAR(30) NOT NULL DEFAULT 'FALCON'
    CHECK (source IN ('FALCON','IRMS','LEGACY_P2P')),
  external_reference VARCHAR(120),
  current_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, acquisition_number),
  UNIQUE (tenant_id, source, external_reference)
);

CREATE TABLE IF NOT EXISTS acq_request_versions (
  acquisition_version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquisition_id UUID NOT NULL REFERENCES acq_requests(acquisition_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  version_number INT NOT NULL CHECK (version_number > 0),
  schema_version VARCHAR(20) NOT NULL DEFAULT '1.0',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT','VALIDATED','VENDOR_REVIEW','BUDGET_RESERVED','PENDING_DOFA',
    'APPROVED','BUDGET_BLOCKED','REJECTED','WITHDRAWN','SUPERSEDED','EXPIRED'
  )),
  intended_department_id INT REFERENCES departments(dept_id) ON DELETE SET NULL,
  intended_lab_or_project VARCHAR(255),
  intended_use_case TEXT NOT NULL DEFAULT '',
  required_by_date DATE,
  priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL'
    CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  funding_source_type VARCHAR(30) NOT NULL DEFAULT 'DEPARTMENT'
    CHECK (funding_source_type IN ('DEPARTMENT','PROGRAM','PROJECT','RESEARCH_GRANT','INSTITUTIONAL','OTHER')),
  funding_source_id UUID,
  expected_service_life_months INT CHECK (expected_service_life_months IS NULL OR expected_service_life_months > 0),
  default_item_classification VARCHAR(20)
    CHECK (default_item_classification IS NULL OR default_item_classification IN ('ASSET','CONSUMABLE','SERVICE')),
  installation_or_service_required BOOLEAN NOT NULL DEFAULT false,
  special_procurement_requirements TEXT,
  remarks TEXT,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  product_cost NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (product_cost >= 0),
  delivery_cost NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (delivery_cost >= 0),
  tax_cost NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (tax_cost >= 0),
  installation_cost NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (installation_cost >= 0),
  service_cost NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (service_cost >= 0),
  miscellaneous_cost NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (miscellaneous_cost >= 0),
  estimated_total NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (estimated_total >= 0),
  snapshot_json JSONB,
  snapshot_hash CHAR(64),
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  supersedes_version_id UUID REFERENCES acq_request_versions(acquisition_version_id) ON DELETE RESTRICT,
  dofa_case_id UUID REFERENCES dofa_cases(case_id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (acquisition_id, version_number)
);

ALTER TABLE acq_requests
  ADD CONSTRAINT acq_requests_current_version_id_fkey
  FOREIGN KEY (current_version_id) REFERENCES acq_request_versions(acquisition_version_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS acq_lines (
  line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquisition_version_id UUID NOT NULL REFERENCES acq_request_versions(acquisition_version_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  line_number INT NOT NULL CHECK (line_number > 0),
  acquisition_layout VARCHAR(20) NOT NULL CHECK (acquisition_layout IN ('ONLINE','OFFLINE','GENERAL')),
  product_name VARCHAR(255) NOT NULL,
  category VARCHAR(120) NOT NULL,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit VARCHAR(40) NOT NULL DEFAULT 'unit',
  brand VARCHAR(160),
  model_number VARCHAR(160),
  part_number VARCHAR(160),
  technical_specifications JSONB NOT NULL DEFAULT '{}'::jsonb,
  product_description TEXT,
  intended_use TEXT NOT NULL,
  estimated_unit_price NUMERIC(15,2) NOT NULL CHECK (estimated_unit_price >= 0),
  estimated_line_total NUMERIC(15,2) NOT NULL CHECK (estimated_line_total >= 0),
  delivery_cost NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (delivery_cost >= 0),
  tax_cost NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (tax_cost >= 0),
  installation_cost NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (installation_cost >= 0),
  service_cost NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (service_cost >= 0),
  miscellaneous_cost NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (miscellaneous_cost >= 0),
  preferred_vendor_id UUID REFERENCES fin_vendors(vendor_id) ON DELETE SET NULL,
  preferred_vendor_name VARCHAR(255),
  selected_vendor_id UUID REFERENCES fin_vendors(vendor_id) ON DELETE SET NULL,
  vendor_deviation_justification TEXT,
  product_url TEXT,
  vendor_contact TEXT,
  vendor_address TEXT,
  vendor_business_reference TEXT,
  return_policy TEXT,
  replacement_policy TEXT,
  warranty_requirements TEXT,
  expected_delivery_days INT CHECK (expected_delivery_days IS NULL OR expected_delivery_days >= 0),
  item_classification VARCHAR(20) NOT NULL DEFAULT 'ASSET'
    CHECK (item_classification IN ('ASSET','CONSUMABLE','SERVICE')),
  expected_service_life_months INT CHECK (expected_service_life_months IS NULL OR expected_service_life_months > 0),
  special_procurement_requirements TEXT,
  remarks TEXT,
  validation_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (validation_status IN ('PENDING','VALID','INVALID')),
  vendor_review_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (vendor_review_status IN ('PENDING','RECOMMENDED','SELECTED','EXCEPTION')),
  line_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (line_status IN ('ACTIVE','EXCLUDED','APPROVED','SUPERSEDED')),
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  validation_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (acquisition_version_id, line_number)
);

CREATE TABLE IF NOT EXISTS acq_vendor_scoring_policies (
  scoring_policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  policy_version INT NOT NULL CHECK (policy_version > 0),
  category VARCHAR(120) NOT NULL DEFAULT '*',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','SUPERSEDED')),
  weights JSONB NOT NULL,
  eligibility_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  minimum_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  published_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, category, policy_version)
);

CREATE TABLE IF NOT EXISTS acq_operational_policies (
  operational_policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  policy_version INT NOT NULL CHECK (policy_version > 0),
  status VARCHAR(20) NOT NULL CHECK (status IN ('DRAFT','PUBLISHED','SUPERSEDED')),
  reservation_days INT NOT NULL DEFAULT 14 CHECK (reservation_days BETWEEN 1 AND 90),
  published_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, policy_version)
);

CREATE TABLE IF NOT EXISTS acq_vendor_performance (
  vendor_performance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES fin_vendors(vendor_id) ON DELETE CASCADE,
  category VARCHAR(120) NOT NULL DEFAULT '*',
  is_empanelled BOOLEAN NOT NULL DEFAULT false,
  compliance_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (compliance_status IN ('COMPLIANT','PENDING','SUSPENDED','BLOCKED')),
  availability_score NUMERIC(5,2),
  delivery_score NUMERIC(5,2),
  conformity_score NUMERIC(5,2),
  invoice_accuracy_score NUMERIC(5,2),
  warranty_service_score NUMERIC(5,2),
  evidence_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, vendor_id, category)
);

CREATE TABLE IF NOT EXISTS acq_vendor_recommendations (
  recommendation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  acquisition_version_id UUID NOT NULL REFERENCES acq_request_versions(acquisition_version_id) ON DELETE RESTRICT,
  line_id UUID NOT NULL REFERENCES acq_lines(line_id) ON DELETE RESTRICT,
  vendor_id UUID NOT NULL REFERENCES fin_vendors(vendor_id) ON DELETE RESTRICT,
  scoring_policy_id UUID NOT NULL REFERENCES acq_vendor_scoring_policies(scoring_policy_id) ON DELETE RESTRICT,
  scoring_policy_version INT NOT NULL,
  raw_inputs JSONB NOT NULL,
  factor_scores JSONB NOT NULL,
  weighted_calculation JSONB NOT NULL,
  final_score NUMERIC(6,3) NOT NULL,
  confidence VARCHAR(20) NOT NULL CHECK (confidence IN ('LOW','MEDIUM','HIGH')),
  eligibility_failures JSONB NOT NULL DEFAULT '[]'::jsonb,
  explanation TEXT NOT NULL,
  rank INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (acquisition_version_id, line_id, vendor_id)
);

CREATE TABLE IF NOT EXISTS acq_budget_reservations (
  budget_reservation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  acquisition_id UUID NOT NULL REFERENCES acq_requests(acquisition_id) ON DELETE RESTRICT,
  acquisition_version_id UUID NOT NULL UNIQUE REFERENCES acq_request_versions(acquisition_version_id) ON DELETE RESTRICT,
  funding_source_type VARCHAR(30) NOT NULL,
  funding_source_id UUID NOT NULL,
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acq_funding_sources (
  funding_source_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  funding_source_type VARCHAR(30) NOT NULL CHECK (funding_source_type IN ('PROJECT','OTHER')),
  name VARCHAR(255) NOT NULL,
  allocated_amount NUMERIC(15,2) NOT NULL CHECK (allocated_amount >= 0),
  encumbered_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (encumbered_amount >= 0),
  utilized_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (utilized_amount >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, funding_source_type, name)
);

ALTER TABLE fin_university_budgets
  ADD COLUMN IF NOT EXISTS encumbered_amount NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE research_grants
  ADD COLUMN IF NOT EXISTS encumbered_amount NUMERIC(15,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS acq_budget_reservation_events (
  reservation_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_reservation_id UUID NOT NULL REFERENCES acq_budget_reservations(budget_reservation_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('RESERVED','RELEASED','EXPIRED','COMMITTED')),
  reason TEXT,
  actor_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acq_dofa_route_snapshots (
  route_snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  acquisition_version_id UUID NOT NULL UNIQUE REFERENCES acq_request_versions(acquisition_version_id) ON DELETE RESTRICT,
  dofa_case_id UUID NOT NULL UNIQUE REFERENCES dofa_cases(case_id) ON DELETE RESTRICT,
  policy_graph_id UUID REFERENCES dofa_policy_graphs(graph_id) ON DELETE RESTRICT,
  policy_version INT,
  matrix_id UUID REFERENCES dofa_matrices(matrix_id) ON DELETE RESTRICT,
  rule_inputs JSONB NOT NULL,
  approval_route JSONB NOT NULL,
  separation_of_duties JSONB NOT NULL,
  route_snapshot_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acq_approval_decisions (
  decision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  acquisition_version_id UUID NOT NULL REFERENCES acq_request_versions(acquisition_version_id) ON DELETE RESTRICT,
  dofa_case_id UUID NOT NULL REFERENCES dofa_cases(case_id) ON DELETE RESTRICT,
  approval_level INT NOT NULL,
  approver_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  approver_role VARCHAR(64) NOT NULL,
  decision VARCHAR(20) NOT NULL CHECK (decision IN ('APPROVED','REJECTED')),
  comment TEXT,
  decision_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decision_hash CHAR(64) NOT NULL UNIQUE,
  previous_decision_hash CHAR(64),
  UNIQUE (dofa_case_id, approval_level)
);

CREATE TABLE IF NOT EXISTS acq_access_grants (
  access_grant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  principal_user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  principal_role VARCHAR(64),
  capability VARCHAR(64) NOT NULL,
  scope_type VARCHAR(20) NOT NULL DEFAULT 'TENANT'
    CHECK (scope_type IN ('TENANT','CAMPUS','DEPARTMENT','LAB','PROJECT')),
  scope_reference VARCHAR(120),
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  granted_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((principal_user_id IS NOT NULL) <> (principal_role IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS acq_import_previews (
  import_preview_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  template_version VARCHAR(20) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  content_hash CHAR(64) NOT NULL,
  parsed_payload JSONB NOT NULL,
  validation_results JSONB NOT NULL,
  malware_scan_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (malware_scan_status IN ('PENDING','CLEAN','INFECTED','SKIPPED')),
  row_count INT NOT NULL CHECK (row_count BETWEEN 1 AND 500),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acq_attachments (
  attachment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  acquisition_version_id UUID NOT NULL REFERENCES acq_request_versions(acquisition_version_id) ON DELETE RESTRICT,
  line_id UUID REFERENCES acq_lines(line_id) ON DELETE RESTRICT,
  object_key TEXT NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  content_hash CHAR(64) NOT NULL,
  malware_scan_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (malware_scan_status IN ('PENDING','CLEAN','INFECTED','QUARANTINED')),
  uploaded_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (object_key LIKE tenant_id::text || '/%'),
  UNIQUE (tenant_id, object_key)
);

CREATE TABLE IF NOT EXISTS acq_integration_clients (
  integration_client_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  client_id VARCHAR(120) NOT NULL,
  certificate_sha256 CHAR(64) NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['acquisitions:create','acquisitions:read-status']::text[],
  callback_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, client_id)
);

CREATE TABLE IF NOT EXISTS acq_integration_replay_nonces (
  replay_nonce_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_client_id UUID NOT NULL REFERENCES acq_integration_clients(integration_client_id) ON DELETE CASCADE,
  jti VARCHAR(180) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (integration_client_id, jti)
);

ALTER TABLE acq_requests
  ADD COLUMN IF NOT EXISTS integration_client_id UUID
  REFERENCES acq_integration_clients(integration_client_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS acq_audit_events (
  audit_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  acquisition_id UUID REFERENCES acq_requests(acquisition_id) ON DELETE RESTRICT,
  acquisition_version_id UUID REFERENCES acq_request_versions(acquisition_version_id) ON DELETE RESTRICT,
  event_type VARCHAR(64) NOT NULL,
  actor_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  actor_type VARCHAR(20) NOT NULL DEFAULT 'USER',
  request_id VARCHAR(120),
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  event_hash CHAR(64) NOT NULL,
  previous_event_hash CHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acq_outbox_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  aggregate_type VARCHAR(50) NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  event_version INT NOT NULL DEFAULT 1,
  payload JSONB NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','PUBLISHED','FAILED')),
  attempts INT NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acq_integration_idempotency (
  idempotency_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  client_id VARCHAR(120) NOT NULL,
  idempotency_key VARCHAR(160) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  response_status INT,
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, client_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_acq_requests_tenant_requester ON acq_requests(tenant_id, requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_acq_versions_tenant_status ON acq_request_versions(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_acq_lines_version ON acq_lines(acquisition_version_id, line_number);
CREATE INDEX IF NOT EXISTS idx_acq_recommendations_line ON acq_vendor_recommendations(line_id, rank);
CREATE INDEX IF NOT EXISTS idx_acq_reservation_events_latest ON acq_budget_reservation_events(budget_reservation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_acq_access_user ON acq_access_grants(tenant_id, principal_user_id, capability);
CREATE INDEX IF NOT EXISTS idx_acq_outbox_pending ON acq_outbox_events(status, available_at) WHERE status IN ('PENDING','FAILED');

CREATE OR REPLACE FUNCTION acq_block_submitted_version_business_changes() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'DRAFT' AND (
    NEW.intended_department_id IS DISTINCT FROM OLD.intended_department_id OR
    NEW.intended_lab_or_project IS DISTINCT FROM OLD.intended_lab_or_project OR
    NEW.intended_use_case IS DISTINCT FROM OLD.intended_use_case OR
    NEW.required_by_date IS DISTINCT FROM OLD.required_by_date OR
    NEW.priority IS DISTINCT FROM OLD.priority OR
    NEW.funding_source_type IS DISTINCT FROM OLD.funding_source_type OR
    NEW.funding_source_id IS DISTINCT FROM OLD.funding_source_id OR
    NEW.special_procurement_requirements IS DISTINCT FROM OLD.special_procurement_requirements OR
    NEW.remarks IS DISTINCT FROM OLD.remarks OR
    NEW.estimated_total IS DISTINCT FROM OLD.estimated_total OR
    NEW.snapshot_json IS DISTINCT FROM OLD.snapshot_json OR
    NEW.snapshot_hash IS DISTINCT FROM OLD.snapshot_hash
  ) THEN
    RAISE EXCEPTION 'ACQUISITION_IMMUTABLE: submitted version business data cannot change';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_acq_version_immutable
BEFORE UPDATE ON acq_request_versions
FOR EACH ROW EXECUTE FUNCTION acq_block_submitted_version_business_changes();

CREATE OR REPLACE FUNCTION acq_block_line_mutation() RETURNS trigger AS $$
DECLARE parent_status TEXT;
BEGIN
  SELECT status INTO parent_status FROM acq_request_versions
  WHERE acquisition_version_id = COALESCE(OLD.acquisition_version_id, NEW.acquisition_version_id);
  IF parent_status <> 'DRAFT' AND (
    NEW.acquisition_layout IS DISTINCT FROM OLD.acquisition_layout OR
    NEW.product_name IS DISTINCT FROM OLD.product_name OR
    NEW.category IS DISTINCT FROM OLD.category OR
    NEW.quantity IS DISTINCT FROM OLD.quantity OR
    NEW.unit IS DISTINCT FROM OLD.unit OR
    NEW.brand IS DISTINCT FROM OLD.brand OR
    NEW.model_number IS DISTINCT FROM OLD.model_number OR
    NEW.part_number IS DISTINCT FROM OLD.part_number OR
    NEW.technical_specifications IS DISTINCT FROM OLD.technical_specifications OR
    NEW.product_description IS DISTINCT FROM OLD.product_description OR
    NEW.intended_use IS DISTINCT FROM OLD.intended_use OR
    NEW.estimated_unit_price IS DISTINCT FROM OLD.estimated_unit_price OR
    NEW.estimated_line_total IS DISTINCT FROM OLD.estimated_line_total OR
    NEW.delivery_cost IS DISTINCT FROM OLD.delivery_cost OR
    NEW.tax_cost IS DISTINCT FROM OLD.tax_cost OR
    NEW.installation_cost IS DISTINCT FROM OLD.installation_cost OR
    NEW.service_cost IS DISTINCT FROM OLD.service_cost OR
    NEW.miscellaneous_cost IS DISTINCT FROM OLD.miscellaneous_cost OR
    NEW.product_url IS DISTINCT FROM OLD.product_url OR
    NEW.warranty_requirements IS DISTINCT FROM OLD.warranty_requirements OR
    NEW.item_classification IS DISTINCT FROM OLD.item_classification OR
    NEW.special_procurement_requirements IS DISTINCT FROM OLD.special_procurement_requirements
  ) THEN
    RAISE EXCEPTION 'ACQUISITION_IMMUTABLE: submitted acquisition lines cannot change';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_acq_lines_immutable_update BEFORE UPDATE ON acq_lines
FOR EACH ROW EXECUTE FUNCTION acq_block_line_mutation();
CREATE TRIGGER tr_acq_lines_immutable_delete BEFORE DELETE ON acq_lines
FOR EACH ROW EXECUTE FUNCTION acq_block_line_mutation();

DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT tenant_id FROM tenants LOOP
    INSERT INTO acq_vendor_scoring_policies (
      tenant_id, policy_version, category, status, weights, eligibility_rules,
      minimum_evidence, effective_from, published_at
    ) VALUES (
      t.tenant_id, 1, '*', 'PUBLISHED',
      '{"price":25,"delivery":20,"conformity":20,"invoice_accuracy":10,"warranty_service":10,"compliance":10,"availability":5}'::jsonb,
      '{"requires_empanelment":true,"requires_compliance":true,"requires_category_match":true}'::jsonb,
      '{"high_confidence":10,"medium_confidence":3}'::jsonb,
      NOW(), NOW()
    ) ON CONFLICT (tenant_id, category, policy_version) DO NOTHING;

    INSERT INTO acq_operational_policies
      (tenant_id,policy_version,status,reservation_days,published_at)
    VALUES (t.tenant_id,1,'PUBLISHED',14,NOW())
    ON CONFLICT (tenant_id,policy_version) DO NOTHING;

    INSERT INTO acq_vendor_performance (
      tenant_id, vendor_id, category, is_empanelled, compliance_status,
      availability_score, delivery_score, conformity_score,
      invoice_accuracy_score, warranty_service_score, evidence_count
    )
    SELECT t.tenant_id, v.vendor_id, '*', true,
           CASE WHEN v.is_active THEN 'COMPLIANT' ELSE 'BLOCKED' END,
           50, 50, 50, 50, 50, 0
    FROM fin_vendors v
    WHERE v.tenant_id = t.tenant_id
      AND EXISTS (
        SELECT 1 FROM fin_catalog_vendors cv
        WHERE cv.tenant_id = t.tenant_id AND cv.vendor_id = v.vendor_id AND cv.is_active
      )
    ON CONFLICT (tenant_id, vendor_id, category) DO NOTHING;

    INSERT INTO acq_access_grants (tenant_id, principal_role, capability, scope_type)
    SELECT t.tenant_id, x.role_name, x.capability, 'TENANT'
    FROM (VALUES
      ('Faculty','ACQUISITION_REQUESTER'),
      ('HOD','ACQUISITION_REQUESTER'),
      ('LabAdmin','ACQUISITION_REQUESTER'),
      ('Warden','ACQUISITION_REQUESTER'),
      ('EstateOfficer','ACQUISITION_REQUESTER'),
      ('CampusAdmin','ACQUISITION_REQUESTER'),
      ('SuperAdmin','ACQUISITION_REQUESTER'),
      ('Procurement','ACQUISITION_VENDOR_REVIEW'),
      ('ProcurementBuyer','ACQUISITION_VENDOR_REVIEW'),
      ('ProcurementHead','ACQUISITION_VENDOR_REVIEW'),
      ('FinanceController','ACQUISITION_BUDGET_OVERSIGHT'),
      ('CFO','ACQUISITION_BUDGET_OVERSIGHT'),
      ('InternalAuditor','ACQUISITION_AUDIT_OVERSIGHT'),
      ('CampusAdmin','ACQUISITION_AUDIT_OVERSIGHT'),
      ('SuperAdmin','ACQUISITION_AUDIT_OVERSIGHT')
    ) AS x(role_name, capability)
    WHERE NOT EXISTS (
      SELECT 1 FROM acq_access_grants g
      WHERE g.tenant_id = t.tenant_id AND g.principal_role = x.role_name
        AND g.capability = x.capability AND g.scope_type = 'TENANT'
    );

    INSERT INTO dofa_matrices (
      tenant_id, domain, rule_key, amount_min, amount_max,
      required_roles, required_signatures, exception_escalate_role, is_active
    )
    SELECT t.tenant_id, 'ACQUISITION', x.rule_key, x.amount_min, x.amount_max,
           x.required_roles, x.required_signatures, x.exception_role, true
    FROM (VALUES
      ('L1', 0::numeric, 50000::numeric, ARRAY['HOD']::text[], 1, 'Dean'),
      ('L2', 50000.01::numeric, 200000::numeric, ARRAY['Dean']::text[], 1, 'COO'),
      ('L3', 200000.01::numeric, 500000::numeric, ARRAY['ProcurementHead','FinanceController']::text[], 2, 'COO'),
      ('L4', 500000.01::numeric, 1500000::numeric, ARRAY['COO']::text[], 1, 'President'),
      ('L5', 1500000.01::numeric, NULL::numeric, ARRAY['Chairman']::text[], 1, 'Chairman')
    ) AS x(rule_key, amount_min, amount_max, required_roles, required_signatures, exception_role)
    WHERE NOT EXISTS (
      SELECT 1 FROM dofa_matrices m
      WHERE m.tenant_id = t.tenant_id AND m.domain = 'ACQUISITION' AND m.rule_key = x.rule_key
    );

    INSERT INTO dofa_policy_graphs (
      tenant_id, domain, title, version, status, graph_json, compiled_matrix,
      minutes_ref, proposal_memo, published_at
    )
    SELECT t.tenant_id, 'ACQUISITION', 'Digital Acquisition DOFA', 1, 'PUBLISHED',
      jsonb_build_object('nodes', COALESCE(jsonb_agg(jsonb_build_object(
        'id', m.rule_key, 'type', 'band', 'data', jsonb_build_object(
          'rule_key', m.rule_key, 'amount_min', m.amount_min,
          'amount_max', m.amount_max, 'required_roles', m.required_roles,
          'required_signatures', m.required_signatures,
          'exception_escalate_role', m.exception_escalate_role
        )) ORDER BY m.amount_min), '[]'::jsonb), 'edges', '[]'::jsonb),
      COALESCE(jsonb_agg(jsonb_build_object(
        'rule_key', m.rule_key, 'amount_min', m.amount_min,
        'amount_max', m.amount_max, 'required_roles', m.required_roles,
        'required_signatures', m.required_signatures,
        'exception_escalate_role', m.exception_escalate_role
      ) ORDER BY m.amount_min), '[]'::jsonb),
      'ACQ-MODULE1-SEED', 'Initial published acquisition authority matrix', NOW()
    FROM dofa_matrices m
    WHERE m.tenant_id=t.tenant_id AND m.domain='ACQUISITION' AND m.is_active
      AND NOT EXISTS (
        SELECT 1 FROM dofa_policy_graphs g
        WHERE g.tenant_id=t.tenant_id AND g.domain='ACQUISITION' AND g.status='PUBLISHED'
      )
    GROUP BY t.tenant_id;
  END LOOP;
END $$;

-- Existing immutable-ledger helpers are installed by the Policy Vault migration.
CREATE TRIGGER tr_acq_audit_no_update BEFORE UPDATE ON acq_audit_events
FOR EACH ROW EXECUTE FUNCTION fortress_block_immutable_update();
CREATE TRIGGER tr_acq_audit_no_delete BEFORE DELETE ON acq_audit_events
FOR EACH ROW EXECUTE FUNCTION fortress_block_immutable_delete();
CREATE TRIGGER tr_acq_decision_no_update BEFORE UPDATE ON acq_approval_decisions
FOR EACH ROW EXECUTE FUNCTION fortress_block_immutable_update();
CREATE TRIGGER tr_acq_decision_no_delete BEFORE DELETE ON acq_approval_decisions
FOR EACH ROW EXECUTE FUNCTION fortress_block_immutable_delete();
CREATE TRIGGER tr_acq_reservation_no_update BEFORE UPDATE ON acq_budget_reservations
FOR EACH ROW EXECUTE FUNCTION fortress_block_immutable_update();
CREATE TRIGGER tr_acq_reservation_no_delete BEFORE DELETE ON acq_budget_reservations
FOR EACH ROW EXECUTE FUNCTION fortress_block_immutable_delete();
CREATE TRIGGER tr_acq_attachment_no_update BEFORE UPDATE ON acq_attachments
FOR EACH ROW EXECUTE FUNCTION fortress_block_immutable_update();
CREATE TRIGGER tr_acq_attachment_no_delete BEFORE DELETE ON acq_attachments
FOR EACH ROW EXECUTE FUNCTION fortress_block_immutable_delete();

-- DOFA Module 2: canonical progressive procurement and fund ledger

CREATE TABLE IF NOT EXISTS proc_cases (
  proc_case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  acquisition_id UUID NOT NULL REFERENCES acq_requests(acquisition_id) ON DELETE RESTRICT,
  acquisition_version_id UUID NOT NULL UNIQUE REFERENCES acq_request_versions(acquisition_version_id) ON DELETE RESTRICT,
  acquisition_snapshot_hash CHAR(64) NOT NULL,
  budget_reservation_id UUID NOT NULL UNIQUE REFERENCES acq_budget_reservations(budget_reservation_id) ON DELETE RESTRICT,
  source_event_id UUID NOT NULL UNIQUE REFERENCES acq_outbox_events(event_id) ON DELETE RESTRICT,
  requester_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  department_id INT REFERENCES departments(dept_id) ON DELETE SET NULL,
  currency CHAR(3) NOT NULL,
  approved_allocation NUMERIC(15,2) NOT NULL CHECK (approved_allocation > 0),
  available_amount NUMERIC(15,2) NOT NULL CHECK (available_amount >= 0),
  committed_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (committed_amount >= 0),
  expended_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (expended_amount >= 0),
  released_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (released_amount >= 0),
  status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','ON_HOLD','READY_TO_FINALIZE','FINALIZED','CANCELLED')),
  aggregate_revision BIGINT NOT NULL DEFAULT 1 CHECK (aggregate_revision > 0),
  next_event_sequence BIGINT NOT NULL DEFAULT 1 CHECK (next_event_sequence > 0),
  allocated_at TIMESTAMPTZ NOT NULL,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ,
  finalized_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT proc_case_bucket_conservation CHECK (
    approved_allocation = available_amount + committed_amount + expended_amount + released_amount
  )
);

CREATE TABLE IF NOT EXISTS proc_case_lines (
  proc_case_line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  acquisition_line_id UUID NOT NULL UNIQUE REFERENCES acq_lines(line_id) ON DELETE RESTRICT,
  line_number INT NOT NULL CHECK (line_number > 0),
  product_name VARCHAR(255) NOT NULL,
  category VARCHAR(120) NOT NULL,
  approved_quantity NUMERIC(12,3) NOT NULL CHECK (approved_quantity > 0),
  unit VARCHAR(40) NOT NULL,
  approved_vendor_id UUID REFERENCES fin_vendors(vendor_id) ON DELETE RESTRICT,
  approved_unit_price NUMERIC(15,2) NOT NULL CHECK (approved_unit_price >= 0),
  approved_line_amount NUMERIC(15,2) NOT NULL CHECK (approved_line_amount >= 0),
  cancelled_quantity NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (cancelled_quantity >= 0 AND cancelled_quantity <= approved_quantity),
  cancellation_reason TEXT,
  currency CHAR(3) NOT NULL,
  fulfillment_type VARCHAR(20) NOT NULL
    CHECK (fulfillment_type IN ('ASSET','CONSUMABLE','SERVICE','INSTALLATION')),
  requires_physical_verification BOOLEAN NOT NULL DEFAULT false,
  requires_asset_identity BOOLEAN NOT NULL DEFAULT false,
  requires_inventory_ingestion BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proc_case_id, line_number)
);

CREATE TABLE IF NOT EXISTS proc_match_policies (
  match_policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  policy_version INT NOT NULL CHECK (policy_version > 0),
  category VARCHAR(120) NOT NULL DEFAULT '*',
  fulfillment_type VARCHAR(20) NOT NULL DEFAULT '*',
  status VARCHAR(20) NOT NULL CHECK (status IN ('DRAFT','PUBLISHED','SUPERSEDED')),
  quantity_tolerance NUMERIC(8,4) NOT NULL DEFAULT 0 CHECK (quantity_tolerance >= 0),
  unit_price_tolerance NUMERIC(8,4) NOT NULL DEFAULT 0 CHECK (unit_price_tolerance >= 0),
  tax_tolerance NUMERIC(8,4) NOT NULL DEFAULT 0 CHECK (tax_tolerance >= 0),
  freight_tolerance NUMERIC(8,4) NOT NULL DEFAULT 0 CHECK (freight_tolerance >= 0),
  rounding_tolerance NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (rounding_tolerance >= 0),
  require_receipt BOOLEAN NOT NULL DEFAULT true,
  require_service_acceptance BOOLEAN NOT NULL DEFAULT false,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  published_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, category, fulfillment_type, policy_version)
);

CREATE TABLE IF NOT EXISTS proc_orders (
  order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  order_number VARCHAR(64) NOT NULL,
  external_order_id VARCHAR(160),
  vendor_id UUID NOT NULL REFERENCES fin_vendors(vendor_id) ON DELETE RESTRICT,
  currency CHAR(3) NOT NULL,
  order_date DATE,
  expected_delivery_date DATE,
  product_url TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','ISSUED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED','CLOSED')),
  progress_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (progress_status IN ('PENDING','ENTERED','VERIFIED','FINALIZED')),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  subtotal NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  freight_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (freight_amount >= 0),
  additional_charges NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (additional_charges >= 0),
  total_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  issued_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  legacy_po_id UUID UNIQUE REFERENCES fin_purchase_orders(po_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, order_number),
  UNIQUE (tenant_id, vendor_id, external_order_id)
);

CREATE TABLE IF NOT EXISTS proc_order_lines (
  order_line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES proc_orders(order_id) ON DELETE RESTRICT,
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  proc_case_line_id UUID NOT NULL REFERENCES proc_case_lines(proc_case_line_id) ON DELETE RESTRICT,
  acquisition_line_id UUID NOT NULL REFERENCES acq_lines(line_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(15,2) NOT NULL CHECK (unit_price >= 0),
  tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  freight_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (freight_amount >= 0),
  additional_charges NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (additional_charges >= 0),
  line_total NUMERIC(15,2) NOT NULL CHECK (line_total >= 0),
  cancelled_quantity NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (cancelled_quantity >= 0 AND cancelled_quantity <= quantity),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','CANCELLED','CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proc_receipts (
  receipt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES proc_orders(order_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  receipt_number VARCHAR(64) NOT NULL,
  actual_delivery_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ENTERED'
    CHECK (status IN ('PENDING','ENTERED','VERIFIED','FINALIZED')),
  notes TEXT,
  recorded_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  legacy_grn_id UUID UNIQUE REFERENCES fin_goods_receipts(grn_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, receipt_number)
);

CREATE TABLE IF NOT EXISTS proc_receipt_lines (
  receipt_line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES proc_receipts(receipt_id) ON DELETE RESTRICT,
  order_line_id UUID NOT NULL REFERENCES proc_order_lines(order_line_id) ON DELETE RESTRICT,
  proc_case_line_id UUID NOT NULL REFERENCES proc_case_lines(proc_case_line_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  received_quantity NUMERIC(12,3) NOT NULL CHECK (received_quantity >= 0),
  accepted_quantity NUMERIC(12,3) NOT NULL CHECK (accepted_quantity >= 0),
  rejected_quantity NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (rejected_quantity >= 0),
  discrepancy_reason TEXT,
  CHECK (accepted_quantity + rejected_quantity <= received_quantity)
);

CREATE TABLE IF NOT EXISTS proc_service_acceptances (
  service_acceptance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  order_line_id UUID NOT NULL REFERENCES proc_order_lines(order_line_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  accepted_quantity NUMERIC(12,3) NOT NULL CHECK (accepted_quantity > 0),
  milestone VARCHAR(160),
  acceptance_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ENTERED'
    CHECK (status IN ('PENDING','ENTERED','VERIFIED','FINALIZED')),
  entered_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  verified_by UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (verified_by IS NULL OR verified_by <> entered_by)
);

CREATE TABLE IF NOT EXISTS proc_invoices (
  invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES proc_orders(order_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES fin_vendors(vendor_id) ON DELETE RESTRICT,
  invoice_number VARCHAR(120) NOT NULL,
  invoice_date DATE NOT NULL,
  currency CHAR(3) NOT NULL,
  taxable_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (taxable_amount >= 0),
  tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  freight_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (freight_amount >= 0),
  total_amount NUMERIC(15,2) NOT NULL CHECK (total_amount >= 0),
  status VARCHAR(24) NOT NULL DEFAULT 'ENTERED'
    CHECK (status IN ('PENDING','ENTERED','VERIFIED','DISPUTED','PARTIALLY_PAID','PAID','VOID','FINALIZED')),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  document_object_key TEXT,
  document_hash CHAR(64),
  document_scan_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (document_scan_status IN ('PENDING','CLEAN','INFECTED','QUARANTINED')),
  duplicate_hash CHAR(64),
  entered_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  verified_by UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  verified_at TIMESTAMPTZ,
  legacy_invoice_id UUID UNIQUE REFERENCES fin_vendor_invoices(invoice_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, vendor_id, invoice_number),
  CHECK (verified_by IS NULL OR verified_by <> entered_by),
  CHECK (document_object_key IS NULL OR document_object_key LIKE tenant_id::text || '/%')
);

CREATE TABLE IF NOT EXISTS proc_invoice_lines (
  invoice_line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES proc_invoices(invoice_id) ON DELETE RESTRICT,
  order_line_id UUID NOT NULL REFERENCES proc_order_lines(order_line_id) ON DELETE RESTRICT,
  proc_case_line_id UUID NOT NULL REFERENCES proc_case_lines(proc_case_line_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(15,2) NOT NULL CHECK (unit_price >= 0),
  tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  freight_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (freight_amount >= 0),
  line_total NUMERIC(15,2) NOT NULL CHECK (line_total >= 0)
);

CREATE TABLE IF NOT EXISTS proc_match_results (
  match_result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES proc_invoices(invoice_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  match_policy_id UUID NOT NULL REFERENCES proc_match_policies(match_policy_id) ON DELETE RESTRICT,
  policy_version INT NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('MATCHED','BLOCKED','RESOLVED')),
  dimensions JSONB NOT NULL,
  discrepancies JSONB NOT NULL DEFAULT '[]'::jsonb,
  snapshot_hash CHAR(64) NOT NULL,
  resolved_by UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  resolved_at TIMESTAMPTZ,
  resolution_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proc_payments (
  payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES proc_invoices(invoice_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  payment_reference VARCHAR(160) NOT NULL,
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL,
  payment_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','REVERSED')),
  posted_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  reversal_of_payment_id UUID REFERENCES proc_payments(payment_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, payment_reference)
);

CREATE TABLE IF NOT EXISTS proc_adjustments (
  adjustment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  order_id UUID REFERENCES proc_orders(order_id) ON DELETE RESTRICT,
  invoice_id UUID REFERENCES proc_invoices(invoice_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  adjustment_type VARCHAR(24) NOT NULL
    CHECK (adjustment_type IN ('ADDITIONAL_CHARGE','CREDIT_NOTE','REFUND')),
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL,
  reference_number VARCHAR(160),
  status VARCHAR(20) NOT NULL DEFAULT 'ENTERED'
    CHECK (status IN ('ENTERED','VERIFIED','POSTED','REVERSED')),
  entered_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  verified_by UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  posted_by UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (verified_by IS NULL OR verified_by <> entered_by)
);

CREATE TABLE IF NOT EXISTS proc_returns (
  return_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  receipt_line_id UUID NOT NULL REFERENCES proc_receipt_lines(receipt_line_id) ON DELETE RESTRICT,
  order_line_id UUID NOT NULL REFERENCES proc_order_lines(order_line_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  attributable_value NUMERIC(15,2) NOT NULL CHECK (attributable_value >= 0),
  reason TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED','APPROVED','SHIPPED','VENDOR_RECEIVED','RESOLVED','REJECTED','CANCELLED')),
  financial_status VARCHAR(24) NOT NULL DEFAULT 'NONE'
    CHECK (financial_status IN ('NONE','CREDIT_EXPECTED','CREDIT_RECEIVED','REFUND_EXPECTED','REFUND_POSTED')),
  requested_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  approved_by UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  replacement_for_return_id UUID REFERENCES proc_returns(return_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (approved_by IS NULL OR approved_by <> requested_by)
);

CREATE TABLE IF NOT EXISTS proc_repairs (
  repair_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  receipt_line_id UUID NOT NULL REFERENCES proc_receipt_lines(receipt_line_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  status VARCHAR(24) NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED','APPROVED','SHIPPED','IN_REPAIR','RETURNED','CLOSED','CANCELLED')),
  notes TEXT,
  requested_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE proc_receipts
  ADD COLUMN IF NOT EXISTS replacement_for_return_id UUID REFERENCES proc_returns(return_id) ON DELETE RESTRICT;
ALTER TABLE proc_adjustments
  ADD COLUMN IF NOT EXISTS return_id UUID REFERENCES proc_returns(return_id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS proc_downstream_status (
  downstream_status_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  proc_case_line_id UUID NOT NULL REFERENCES proc_case_lines(proc_case_line_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  source_event_id UUID NOT NULL UNIQUE,
  source_module VARCHAR(40) NOT NULL,
  status_type VARCHAR(40) NOT NULL
    CHECK (status_type IN ('PHYSICAL_VERIFICATION','RFID_ALLOCATION','ASSET_ID_ALLOCATION','INVENTORY_INGESTION','CONSUMABLE_LEDGER')),
  status VARCHAR(24) NOT NULL CHECK (status IN ('PENDING','ENTERED','VERIFIED','FINALIZED','NOT_REQUIRED')),
  aggregate_sequence BIGINT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proc_case_line_id, status_type, aggregate_sequence)
);

CREATE TABLE IF NOT EXISTS proc_financial_ledger (
  ledger_entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  entry_type VARCHAR(40) NOT NULL,
  from_bucket VARCHAR(16) CHECK (from_bucket IS NULL OR from_bucket IN ('AVAILABLE','COMMITTED','EXPENDED','RELEASED')),
  to_bucket VARCHAR(16) NOT NULL CHECK (to_bucket IN ('AVAILABLE','COMMITTED','EXPENDED','RELEASED')),
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL,
  source_type VARCHAR(40) NOT NULL,
  source_id UUID NOT NULL,
  idempotency_key VARCHAR(160) NOT NULL,
  actor_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  case_revision BIGINT NOT NULL,
  previous_entry_hash CHAR(64),
  entry_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS proc_audit_events (
  audit_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  entity_type VARCHAR(40) NOT NULL,
  entity_id UUID NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  actor_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  actor_type VARCHAR(20) NOT NULL DEFAULT 'USER',
  previous_values JSONB,
  new_values JSONB,
  entity_revision BIGINT,
  request_id VARCHAR(120),
  previous_event_hash CHAR(64),
  event_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proc_outbox_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  aggregate_id UUID NOT NULL,
  aggregate_revision BIGINT NOT NULL,
  aggregate_sequence BIGINT NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  event_version INT NOT NULL DEFAULT 1,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PROCESSING','PUBLISHED','FAILED')),
  attempts INT NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (aggregate_id, aggregate_sequence)
);

CREATE TABLE IF NOT EXISTS proc_idempotency (
  idempotency_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  actor_id VARCHAR(160) NOT NULL,
  idempotency_key VARCHAR(160) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  response_status INT,
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  UNIQUE (tenant_id, actor_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS proc_import_previews (
  import_preview_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  base_revision BIGINT NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  content_hash CHAR(64) NOT NULL,
  parsed_changes JSONB NOT NULL,
  validation_results JSONB NOT NULL,
  malware_scan_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (malware_scan_status IN ('PENDING','CLEAN','INFECTED','QUARANTINED')),
  changed_rows INT NOT NULL CHECK (changed_rows BETWEEN 1 AND 500),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proc_document_uploads (
  document_upload_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  object_key TEXT NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  content_hash CHAR(64) NOT NULL,
  malware_scan_status VARCHAR(20) NOT NULL
    CHECK (malware_scan_status IN ('CLEAN','INFECTED','QUARANTINED')),
  uploaded_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '24 hours',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (object_key LIKE tenant_id::text || '/%'),
  UNIQUE (tenant_id,object_key)
);

ALTER TABLE fin_purchase_orders
  ADD COLUMN IF NOT EXISTS proc_order_id UUID UNIQUE REFERENCES proc_orders(order_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_system VARCHAR(24) NOT NULL DEFAULT 'LEGACY_P2P';
ALTER TABLE fin_vendor_invoices
  ADD COLUMN IF NOT EXISTS proc_invoice_id UUID UNIQUE REFERENCES proc_invoices(invoice_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_system VARCHAR(24) NOT NULL DEFAULT 'LEGACY_P2P';
ALTER TABLE fin_goods_receipts
  ADD COLUMN IF NOT EXISTS proc_receipt_id UUID UNIQUE REFERENCES proc_receipts(receipt_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_system VARCHAR(24) NOT NULL DEFAULT 'LEGACY_P2P';
ALTER TABLE fin_po_lines
  ADD COLUMN IF NOT EXISTS proc_order_line_id UUID UNIQUE REFERENCES proc_order_lines(order_line_id) ON DELETE RESTRICT;
ALTER TABLE fin_grn_lines
  ADD COLUMN IF NOT EXISTS proc_receipt_line_id UUID UNIQUE REFERENCES proc_receipt_lines(receipt_line_id) ON DELETE RESTRICT;

ALTER TABLE acq_budget_reservation_events
  DROP CONSTRAINT IF EXISTS acq_budget_reservation_events_event_type_check;
ALTER TABLE acq_budget_reservation_events
  ADD CONSTRAINT acq_budget_reservation_events_event_type_check
  CHECK (event_type IN ('RESERVED','PARTIALLY_COMMITTED','COMMITTED','RELEASED','EXPIRED'));
ALTER TABLE acq_budget_reservation_events
  ADD COLUMN IF NOT EXISTS amount NUMERIC(15,2) CHECK (amount IS NULL OR amount >= 0),
  ADD COLUMN IF NOT EXISTS proc_case_id UUID REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT;
ALTER TABLE fin_university_budgets
  ADD COLUMN IF NOT EXISTS utilized_amount NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE research_grants
  ADD COLUMN IF NOT EXISTS utilized_amount NUMERIC(15,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_proc_cases_scope ON proc_cases(tenant_id, department_id, status, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_proc_case_lines_case ON proc_case_lines(proc_case_id, line_number);
CREATE INDEX IF NOT EXISTS idx_proc_orders_case ON proc_orders(proc_case_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proc_order_lines_case_line ON proc_order_lines(proc_case_line_id, status);
CREATE INDEX IF NOT EXISTS idx_proc_receipts_order ON proc_receipts(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proc_invoices_case ON proc_invoices(proc_case_id, status, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_proc_returns_case ON proc_returns(proc_case_id, status);
CREATE INDEX IF NOT EXISTS idx_proc_ledger_case ON proc_financial_ledger(proc_case_id, created_at, ledger_entry_id);
CREATE INDEX IF NOT EXISTS idx_proc_outbox_pending ON proc_outbox_events(status, available_at) WHERE status IN ('PENDING','FAILED');

CREATE OR REPLACE FUNCTION proc_block_finalized_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PROCUREMENT_IMMUTABLE: finalized financial records require reversal or correction';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_proc_order_finalized_immutable BEFORE UPDATE ON proc_orders
FOR EACH ROW WHEN (OLD.progress_status = 'FINALIZED') EXECUTE FUNCTION proc_block_finalized_mutation();
CREATE TRIGGER tr_proc_invoice_finalized_immutable BEFORE UPDATE ON proc_invoices
FOR EACH ROW WHEN (OLD.status IN ('FINALIZED','PAID','VOID')) EXECUTE FUNCTION proc_block_finalized_mutation();
CREATE TRIGGER tr_proc_payment_immutable BEFORE UPDATE OR DELETE ON proc_payments
FOR EACH ROW EXECUTE FUNCTION proc_block_finalized_mutation();
CREATE TRIGGER tr_proc_ledger_immutable BEFORE UPDATE OR DELETE ON proc_financial_ledger
FOR EACH ROW EXECUTE FUNCTION proc_block_finalized_mutation();
CREATE TRIGGER tr_proc_audit_immutable BEFORE UPDATE OR DELETE ON proc_audit_events
FOR EACH ROW EXECUTE FUNCTION proc_block_finalized_mutation();

DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT tenant_id FROM tenants LOOP
    INSERT INTO proc_match_policies (
      tenant_id, policy_version, category, fulfillment_type, status,
      quantity_tolerance, unit_price_tolerance, tax_tolerance,
      freight_tolerance, rounding_tolerance, require_receipt,
      require_service_acceptance, published_at
    ) VALUES (t.tenant_id,1,'*','*','PUBLISHED',0,0,0,0,0,true,false,NOW())
    ON CONFLICT (tenant_id,category,fulfillment_type,policy_version) DO NOTHING;

    INSERT INTO acq_access_grants (tenant_id, principal_role, capability, scope_type)
    SELECT t.tenant_id, x.role_name, x.capability, 'TENANT'
    FROM (VALUES
      ('Faculty','PROCUREMENT_VIEW'),('HOD','PROCUREMENT_VIEW'),('LabAdmin','PROCUREMENT_VIEW'),
      ('Procurement','PROCUREMENT_ORDER_ENTRY'),('ProcurementBuyer','PROCUREMENT_ORDER_ENTRY'),
      ('ProcurementHead','PROCUREMENT_ORDER_ENTRY'),
      ('Stores','PROCUREMENT_RECEIPT_ENTRY'),('ReceivingClerk','PROCUREMENT_RECEIPT_ENTRY'),
      ('APClerk','PROCUREMENT_INVOICE_ENTRY'),('Accountant','PROCUREMENT_INVOICE_ENTRY'),
      ('APManager','PROCUREMENT_INVOICE_VERIFY'),('FinanceController','PROCUREMENT_INVOICE_VERIFY'),
      ('APManager','PROCUREMENT_PAYMENT_POST'),('CFO','PROCUREMENT_PAYMENT_POST'),
      ('InternalAuditor','PROCUREMENT_AUDIT_VIEW'),('SuperAdmin','PROCUREMENT_AUDIT_VIEW'),
      ('SuperAdmin','PROCUREMENT_ORDER_ENTRY'),('SuperAdmin','PROCUREMENT_RECEIPT_ENTRY'),
      ('SuperAdmin','PROCUREMENT_INVOICE_ENTRY'),('SuperAdmin','PROCUREMENT_INVOICE_VERIFY'),
      ('SuperAdmin','PROCUREMENT_PAYMENT_POST'),('SuperAdmin','PROCUREMENT_IMPORT_ADMIN')
    ) AS x(role_name, capability)
    WHERE NOT EXISTS (
      SELECT 1 FROM acq_access_grants g
      WHERE g.tenant_id=t.tenant_id AND g.principal_role=x.role_name
        AND g.capability=x.capability AND g.scope_type='TENANT'
    );
  END LOOP;
END $$;

INSERT INTO tenant_subscriptions (tenant_id,feature_key,is_enabled)
SELECT tenant_id,'dofa_module2_progressive_procurement',false FROM tenants
ON CONFLICT (tenant_id,feature_key) DO NOTHING;

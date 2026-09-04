-- Module 2 progressive flexibility, receipt evidence and controlled deviations.

ALTER TABLE proc_orders
  ADD COLUMN IF NOT EXISTS has_discrepancy BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discrepancy_justification TEXT,
  ADD COLUMN IF NOT EXISTS overrun_percent NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (overrun_percent >= 0),
  ADD COLUMN IF NOT EXISTS exception_status VARCHAR(24) NOT NULL DEFAULT 'NOT_REQUIRED'
    CHECK (exception_status IN ('NOT_REQUIRED','JUSTIFIED','FINANCE_APPROVAL_REQUIRED','APPROVED','REJECTED'));

ALTER TABLE proc_order_lines
  ALTER COLUMN proc_case_line_id DROP NOT NULL,
  ALTER COLUMN acquisition_line_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS product_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS category VARCHAR(120),
  ADD COLUMN IF NOT EXISTS unit VARCHAR(40),
  ADD COLUMN IF NOT EXISTS fulfillment_type VARCHAR(20)
    CHECK (fulfillment_type IS NULL OR fulfillment_type IN ('ASSET','CONSUMABLE','SERVICE','INSTALLATION')),
  ADD COLUMN IF NOT EXISTS is_unplanned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discrepancy_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS discrepancy_justification TEXT;

ALTER TABLE proc_receipts
  ADD COLUMN IF NOT EXISTS package_evidence_upload_id UUID REFERENCES proc_document_uploads(document_upload_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS capture_latitude NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS capture_longitude NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS capture_accuracy_metres NUMERIC(9,2),
  ADD COLUMN IF NOT EXISTS evidence_captured_at TIMESTAMPTZ;

ALTER TABLE proc_receipt_lines
  ALTER COLUMN proc_case_line_id DROP NOT NULL;

ALTER TABLE proc_invoice_lines
  ALTER COLUMN proc_case_line_id DROP NOT NULL;

ALTER TABLE proc_document_uploads
  ADD COLUMN IF NOT EXISTS purpose VARCHAR(32) NOT NULL DEFAULT 'INVOICE'
    CHECK (purpose IN ('INVOICE','PACKAGE_RECEIPT','RECEIVED_PRODUCT')),
  ADD COLUMN IF NOT EXISTS capture_latitude NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS capture_longitude NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS capture_accuracy_metres NUMERIC(9,2),
  ADD COLUMN IF NOT EXISTS client_captured_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_proc_document_uploads_case_purpose
  ON proc_document_uploads(proc_case_id,purpose,created_at DESC);

CREATE TABLE IF NOT EXISTS proc_receipt_evidence (
  receipt_evidence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proc_case_id UUID NOT NULL REFERENCES proc_cases(proc_case_id) ON DELETE RESTRICT,
  receipt_line_id UUID REFERENCES proc_receipt_lines(receipt_line_id) ON DELETE RESTRICT,
  document_upload_id UUID NOT NULL UNIQUE REFERENCES proc_document_uploads(document_upload_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  evidence_type VARCHAR(32) NOT NULL CHECK (evidence_type IN ('PACKAGE_RECEIPT','RECEIVED_PRODUCT')),
  captured_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proc_receipt_evidence_case_line
  ON proc_receipt_evidence(proc_case_id,receipt_line_id,created_at DESC);

-- Separate sealed-package custody receipt from requester product acceptance.

ALTER TABLE proc_receipt_lines
  ADD COLUMN IF NOT EXISTS acceptance_status VARCHAR(24) NOT NULL DEFAULT 'PRODUCT_CONFIRMED'
    CHECK (acceptance_status IN ('PACKAGE_RECEIVED','PRODUCT_CONFIRMED')),
  ADD COLUMN IF NOT EXISTS product_evidence_upload_id UUID REFERENCES proc_document_uploads(document_upload_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS accepted_by UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_proc_receipt_line_product_evidence
  ON proc_receipt_lines(product_evidence_upload_id)
  WHERE product_evidence_upload_id IS NOT NULL;

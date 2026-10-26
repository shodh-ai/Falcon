-- Additive only. Legacy metadata/storage paths are not trusted or backfilled.
CREATE UNIQUE INDEX IF NOT EXISTS uq_question_paper_tenant
  ON exam_question_papers(qp_id, tenant_id);

CREATE TABLE IF NOT EXISTS exam_question_paper_versions (
  version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qp_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  version_number INT NOT NULL CHECK (version_number > 0),
  storage_key TEXT NOT NULL UNIQUE,
  document_sha256 VARCHAR(64) NOT NULL CHECK (document_sha256 ~ '^[0-9a-f]{64}$'),
  document_bytes INT NOT NULL CHECK (document_bytes BETWEEN 1 AND 26214400),
  uploaded_by UUID NOT NULL REFERENCES users(user_id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reason TEXT CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 3 AND 2000),
  UNIQUE (qp_id, version_number),
  FOREIGN KEY (qp_id, tenant_id) REFERENCES exam_question_papers(qp_id, tenant_id),
  CHECK (storage_key = tenant_id::text || '/exam-cell/question-papers/' || qp_id::text || '/' || version_id::text || '.pdf')
);
CREATE INDEX IF NOT EXISTS idx_question_paper_versions_tenant
  ON exam_question_paper_versions(tenant_id, qp_id, version_number DESC);

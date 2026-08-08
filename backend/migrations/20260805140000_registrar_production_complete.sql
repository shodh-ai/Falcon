-- Registrar production-complete: certificate public verify + bulk upload retry payload.

ALTER TABLE registrar_certificate_requests
  ADD COLUMN IF NOT EXISTS verification_code VARCHAR(32);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_cert_verification_code
  ON registrar_certificate_requests (verification_code)
  WHERE verification_code IS NOT NULL;

ALTER TABLE student_bulk_upload_runs
  ADD COLUMN IF NOT EXISTS source_file BYTEA;

ALTER TABLE student_bulk_upload_runs
  ADD COLUMN IF NOT EXISTS retry_available BOOLEAN NOT NULL DEFAULT false;

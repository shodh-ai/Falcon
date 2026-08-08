-- Registrar production hardening
ALTER TABLE registrar_staff_appointments
  ADD COLUMN IF NOT EXISTS letter_pdf_url TEXT;

CREATE INDEX IF NOT EXISTS idx_student_documents_tenant_student
  ON student_documents (tenant_id, student_user_id, created_at DESC);

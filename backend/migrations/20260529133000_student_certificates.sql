-- Student extracurricular certificates vault
CREATE TABLE IF NOT EXISTS student_certificates (
  certificate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  issuer VARCHAR(255) NOT NULL,
  issue_date DATE,
  file_path TEXT NOT NULL,
  file_key TEXT,
  original_filename VARCHAR(255),
  mime_type VARCHAR(100),
  file_size INT,
  verification_status VARCHAR(50) NOT NULL DEFAULT 'PENDING'
    CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  points_awarded INT NOT NULL DEFAULT 0,
  verified_by_user_id UUID REFERENCES users(user_id),
  verified_at TIMESTAMP,
  rejection_reason TEXT,
  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_certificates_user
  ON student_certificates(student_user_id);

CREATE INDEX IF NOT EXISTS idx_student_certificates_tenant_user
  ON student_certificates(tenant_id, student_user_id);

CREATE INDEX IF NOT EXISTS idx_student_certificates_status
  ON student_certificates(verification_status);

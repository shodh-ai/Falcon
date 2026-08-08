-- Registrar critical core fixes:
-- 1) Degree approval columns + history
-- 2) Unique enrollment numbers + sync enrollment_number
-- 3) TRANSFER certificate type + petition → certificate link

-- ── Degree Registrar approval ───────────────────────────────────────────────
ALTER TABLE degree_eligibility_audits
  ADD COLUMN IF NOT EXISTS registrar_decision VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS registrar_remarks TEXT,
  ADD COLUMN IF NOT EXISTS registrar_decided_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS registrar_decided_at TIMESTAMPTZ;

ALTER TABLE degree_eligibility_audits
  DROP CONSTRAINT IF EXISTS degree_eligibility_registrar_decision_check;

ALTER TABLE degree_eligibility_audits
  ADD CONSTRAINT degree_eligibility_registrar_decision_check
  CHECK (registrar_decision IN ('PENDING', 'APPROVED', 'REJECTED'));

CREATE TABLE IF NOT EXISTS registrar_degree_approval_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  audit_id UUID NOT NULL REFERENCES degree_eligibility_audits(audit_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  decision VARCHAR(20) NOT NULL
    CHECK (decision IN ('APPROVED', 'REJECTED')),
  remarks TEXT,
  decided_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reg_degree_approval_hist_audit
  ON registrar_degree_approval_history(tenant_id, audit_id, created_at DESC);

-- ── Enrollment uniqueness ───────────────────────────────────────────────────
-- Disambiguate existing duplicates before unique index
WITH ranked AS (
  SELECT ctid,
         ROW_NUMBER() OVER (
           PARTITION BY tenant_id, enrollment_no
           ORDER BY updated_at DESC NULLS LAST, ctid
         ) AS rn
  FROM student_profiles
  WHERE tenant_id IS NOT NULL
    AND enrollment_no IS NOT NULL
    AND BTRIM(enrollment_no) <> ''
)
UPDATE student_profiles sp
SET enrollment_no = BTRIM(sp.enrollment_no) || '-DUP-' || SUBSTR(sp.user_id::text, 1, 8),
    updated_at = NOW()
FROM ranked r
WHERE sp.ctid = r.ctid
  AND r.rn > 1;

WITH ranked_num AS (
  SELECT ctid,
         ROW_NUMBER() OVER (
           PARTITION BY tenant_id, enrollment_number
           ORDER BY updated_at DESC NULLS LAST, ctid
         ) AS rn
  FROM student_profiles
  WHERE tenant_id IS NOT NULL
    AND enrollment_number IS NOT NULL
    AND BTRIM(enrollment_number) <> ''
)
UPDATE student_profiles sp
SET enrollment_number = BTRIM(sp.enrollment_number) || '-DUP-' || SUBSTR(sp.user_id::text, 1, 8),
    updated_at = NOW()
FROM ranked_num r
WHERE sp.ctid = r.ctid
  AND r.rn > 1;

UPDATE student_profiles
SET enrollment_number = enrollment_no,
    updated_at = NOW()
WHERE NULLIF(BTRIM(COALESCE(enrollment_number, '')), '') IS NULL
  AND NULLIF(BTRIM(COALESCE(enrollment_no, '')), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_profiles_tenant_enrollment_no
  ON student_profiles (tenant_id, enrollment_no)
  WHERE tenant_id IS NOT NULL
    AND enrollment_no IS NOT NULL
    AND BTRIM(enrollment_no) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_profiles_tenant_enrollment_number
  ON student_profiles (tenant_id, enrollment_number)
  WHERE tenant_id IS NOT NULL
    AND enrollment_number IS NOT NULL
    AND BTRIM(enrollment_number) <> '';

-- ── Certificate types + petition link ───────────────────────────────────────
ALTER TABLE registrar_certificate_requests
  DROP CONSTRAINT IF EXISTS registrar_cert_type_check;

ALTER TABLE registrar_certificate_requests
  ADD CONSTRAINT registrar_cert_type_check CHECK (
    certificate_type IN (
      'TRANSCRIPT',
      'BONAFIDE',
      'MIGRATION',
      'PROVISIONAL',
      'DUPLICATE_DEGREE',
      'CHARACTER',
      'DEGREE',
      'TRANSFER'
    )
  );

ALTER TABLE registrar_petitions
  ADD COLUMN IF NOT EXISTS certificate_request_id UUID
    REFERENCES registrar_certificate_requests(request_id) ON DELETE SET NULL;

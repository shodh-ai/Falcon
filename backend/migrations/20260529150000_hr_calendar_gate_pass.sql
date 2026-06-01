-- HR calendar and digital staff gate pass workflow.

ALTER TABLE users ADD COLUMN IF NOT EXISTS reporting_officer_id UUID REFERENCES users(user_id);

CREATE TABLE IF NOT EXISTS staff_gate_passes (
  pass_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  staff_user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  reporting_officer_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  out_time TIMESTAMP NOT NULL,
  expected_in_time TIMESTAMP NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
);

CREATE INDEX IF NOT EXISTS idx_staff_gate_passes_staff
  ON staff_gate_passes(tenant_id, staff_user_id, status);
CREATE INDEX IF NOT EXISTS idx_staff_gate_passes_reporting_officer
  ON staff_gate_passes(tenant_id, reporting_officer_id, status);

-- Give Ellwil a reporting officer for demo approvals.
UPDATE users staff
SET reporting_officer_id = officer.user_id
FROM users officer
WHERE lower(staff.official_email) = 'ellwil@mygyanvihar.com'
  AND lower(officer.official_email) = 'dev.hod@mygyanvihar.com';

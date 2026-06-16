-- Alumni conversion workflow: personal email + request timestamp on exit clearances and profiles.

ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS personal_email VARCHAR(255);

ALTER TABLE student_exit_clearances ADD COLUMN IF NOT EXISTS personal_email VARCHAR(255);
ALTER TABLE student_exit_clearances ADD COLUMN IF NOT EXISTS conversion_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_alumni_profiles_pending
  ON alumni_profiles(tenant_id, verification_status)
  WHERE verification_status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_student_exit_clearances_conversion
  ON student_exit_clearances(tenant_id, conversion_requested_at DESC)
  WHERE alumni_converted = false AND conversion_requested_at IS NOT NULL;

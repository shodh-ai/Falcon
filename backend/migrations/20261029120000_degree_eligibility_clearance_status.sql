-- Preserve the difference between a failed clearance and a clearance that
-- could not be verified. Existing rows remain readable and default to an
-- empty status map, which clients must render as unverified.
ALTER TABLE degree_eligibility_audits
  ADD COLUMN IF NOT EXISTS clearance_statuses JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE degree_eligibility_audits
  ADD COLUMN IF NOT EXISTS requirements_policy_status VARCHAR(24) NOT NULL DEFAULT 'UNCONFIRMED';

-- A missing source result is unknown, not zero. Allow the audit to persist that
-- distinction instead of storing false zero values in legacy NOT NULL metrics.
ALTER TABLE degree_eligibility_audits
  ALTER COLUMN credits_earned DROP NOT NULL,
  ALTER COLUMN pending_backlogs DROP NOT NULL;

ALTER TABLE degree_eligibility_audits
  DROP CONSTRAINT IF EXISTS degree_eligibility_requirements_policy_status_check;

ALTER TABLE degree_eligibility_audits
  ADD CONSTRAINT degree_eligibility_requirements_policy_status_check
  CHECK (requirements_policy_status IN ('UNCONFIRMED', 'CONFIRMED'));

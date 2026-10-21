-- Opt-in only: deployment must not reopen or erase any account or document.
ALTER TABLE staff_profile_reviews
  ADD COLUMN IF NOT EXISTS recovery_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supersedes_review_id UUID REFERENCES staff_profile_reviews(review_id);

CREATE TABLE IF NOT EXISTS staff_profile_recovery_activations (
  activation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  user_id UUID NOT NULL REFERENCES users(user_id),
  review_id UUID NOT NULL UNIQUE REFERENCES staff_profile_reviews(review_id),
  original_snapshot_hash CHAR(64) NOT NULL,
  backup_reference TEXT NOT NULL,
  reason TEXT NOT NULL,
  activated_by UUID REFERENCES users(user_id),
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE OR REPLACE FUNCTION reject_staff_recovery_activation_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Staff recovery activation history is immutable';
END;
$$;
DROP TRIGGER IF EXISTS trg_staff_recovery_activation_immutable ON staff_profile_recovery_activations;
CREATE TRIGGER trg_staff_recovery_activation_immutable
  BEFORE UPDATE OR DELETE ON staff_profile_recovery_activations
  FOR EACH ROW EXECUTE FUNCTION reject_staff_recovery_activation_mutation();

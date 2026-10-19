-- Profile approval and document verification are separate, auditable facts.
-- Existing approvals and original document decisions are not rewritten.
ALTER TABLE staff_profile_reviews
  ADD COLUMN IF NOT EXISTS documents_deferred BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS staff_profile_document_verifications (
  verification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL UNIQUE REFERENCES staff_profile_reviews(review_id),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  user_id UUID NOT NULL REFERENCES users(user_id),
  verified_by UUID NOT NULL REFERENCES users(user_id),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  document_manifest JSONB NOT NULL,
  manifest_hash CHAR(64) NOT NULL,
  CHECK (verified_by <> user_id)
);

CREATE OR REPLACE FUNCTION guard_staff_document_verification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Staff document verification decisions are immutable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM staff_profile_reviews r
    WHERE r.review_id = NEW.review_id AND r.tenant_id = NEW.tenant_id
      AND r.user_id = NEW.user_id AND r.status = 'APPROVED'
      AND r.documents_deferred = true
  ) THEN
    RAISE EXCEPTION 'Document verification requires the exact approved deferred review';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_document_verification_guard ON staff_profile_document_verifications;
CREATE TRIGGER trg_staff_document_verification_guard
  BEFORE INSERT OR UPDATE OR DELETE ON staff_profile_document_verifications
  FOR EACH ROW EXECUTE FUNCTION guard_staff_document_verification();

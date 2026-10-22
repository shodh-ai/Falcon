-- Only hashes of unguessable verification tokens are stored. Public lookups
-- must also confirm the current grade-card publication and revision.
CREATE TABLE IF NOT EXISTS grade_card_verifications (
  verification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  grade_card_id UUID NOT NULL REFERENCES grade_cards(grade_card_id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  revision_hash CHAR(64) NOT NULL,
  result_stage VARCHAR(16) NOT NULL CHECK (result_stage IN ('PROVISIONAL', 'FINAL')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_grade_card_verifications_tenant_card
  ON grade_card_verifications(tenant_id, grade_card_id);

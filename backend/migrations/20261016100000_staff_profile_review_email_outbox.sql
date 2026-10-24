-- Persist correction emails in the same transaction as the HR decision.
CREATE TABLE IF NOT EXISTS staff_profile_review_email_outbox (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  review_id UUID NOT NULL REFERENCES staff_profile_reviews(review_id),
  user_id UUID NOT NULL REFERENCES users(user_id),
  revision INTEGER NOT NULL,
  recipient_email TEXT NOT NULL,
  action_path TEXT NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENDING', 'RETRY', 'SENT')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  last_error VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (review_id, revision)
);
CREATE INDEX IF NOT EXISTS idx_staff_review_email_pending
  ON staff_profile_review_email_outbox (next_attempt_at)
  WHERE status <> 'SENT';

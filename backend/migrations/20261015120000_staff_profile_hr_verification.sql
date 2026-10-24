-- HR verification is independent of first-login onboarding. No staff is
-- reopened automatically by this migration.
CREATE TABLE IF NOT EXISTS staff_profile_reviews (
  review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  user_id UUID NOT NULL REFERENCES users(user_id),
  source VARCHAR(32) NOT NULL CHECK (source IN ('INITIAL', 'PHARMACY_RECHECK')),
  status VARCHAR(32) NOT NULL CHECK (status IN ('PENDING_HR', 'RETURNED_FOR_CORRECTION', 'APPROVED')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  requested_fields TEXT[] NOT NULL DEFAULT '{}',
  requested_docs TEXT[] NOT NULL DEFAULT '{}',
  return_reason TEXT,
  submitted_snapshot_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES users(user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_profile_active_review
  ON staff_profile_reviews (tenant_id, user_id)
  WHERE status IN ('PENDING_HR', 'RETURNED_FOR_CORRECTION');
CREATE INDEX IF NOT EXISTS idx_staff_profile_reviews_queue
  ON staff_profile_reviews (tenant_id, status, updated_at DESC);

CREATE OR REPLACE FUNCTION guard_approved_staff_profile_review()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.status = 'APPROVED' THEN
    RAISE EXCEPTION 'Approved staff profile reviews are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_profile_reviews_approved_immutable ON staff_profile_reviews;
CREATE TRIGGER trg_staff_profile_reviews_approved_immutable
  BEFORE UPDATE OR DELETE ON staff_profile_reviews
  FOR EACH ROW EXECUTE FUNCTION guard_approved_staff_profile_review();

CREATE TABLE IF NOT EXISTS staff_profile_review_batches (
  batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  department_id INTEGER NOT NULL REFERENCES departments(dept_id),
  idempotency_key VARCHAR(160) NOT NULL,
  preview_hash CHAR(64) NOT NULL,
  backup_reference TEXT NOT NULL,
  target_snapshot JSONB NOT NULL,
  created_by UUID NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, department_id)
);

CREATE TABLE IF NOT EXISTS staff_profile_review_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES staff_profile_reviews(review_id),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  user_id UUID NOT NULL REFERENCES users(user_id),
  revision INTEGER NOT NULL CHECK (revision > 0),
  event_type VARCHAR(40) NOT NULL,
  actor_user_id UUID REFERENCES users(user_id),
  reason TEXT,
  profile_snapshot JSONB NOT NULL,
  document_manifest JSONB NOT NULL,
  snapshot_hash CHAR(64) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (review_id, revision)
);

CREATE OR REPLACE FUNCTION reject_staff_profile_review_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Staff profile review events are immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_profile_review_events_immutable ON staff_profile_review_events;
CREATE TRIGGER trg_staff_profile_review_events_immutable
  BEFORE UPDATE OR DELETE ON staff_profile_review_events
  FOR EACH ROW EXECUTE FUNCTION reject_staff_profile_review_event_mutation();

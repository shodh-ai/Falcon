-- Append-only faculty growth record. A skill removal is a new fact, not a
-- destructive edit to the original assertion. Work entries remain historical.
CREATE TABLE IF NOT EXISTS faculty_portfolio_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_sequence BIGSERIAL UNIQUE,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  faculty_user_id UUID NOT NULL REFERENCES users(user_id),
  actor_user_id UUID NOT NULL REFERENCES users(user_id),
  idempotency_key VARCHAR(120) NOT NULL,
  event_type VARCHAR(24) NOT NULL CHECK (event_type IN ('SKILL_ADDED', 'SKILL_REMOVED', 'WORK_COMPLETED')),
  skill_keyword VARCHAR(60),
  work_type VARCHAR(30),
  title VARCHAR(180),
  description TEXT,
  completed_on DATE,
  evidence_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT faculty_portfolio_event_shape CHECK (
    (event_type IN ('SKILL_ADDED', 'SKILL_REMOVED') AND skill_keyword IS NOT NULL
      AND work_type IS NULL AND title IS NULL AND completed_on IS NULL)
    OR (event_type = 'WORK_COMPLETED' AND skill_keyword IS NULL
      AND work_type IS NOT NULL AND title IS NOT NULL AND completed_on IS NOT NULL)
  ),
  CONSTRAINT faculty_portfolio_idempotency UNIQUE (tenant_id, actor_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS faculty_portfolio_target_timeline
  ON faculty_portfolio_events (tenant_id, faculty_user_id, event_sequence DESC);

CREATE OR REPLACE FUNCTION prevent_faculty_portfolio_event_changes()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Faculty portfolio events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS faculty_portfolio_events_immutable ON faculty_portfolio_events;
CREATE TRIGGER faculty_portfolio_events_immutable
  BEFORE UPDATE OR DELETE ON faculty_portfolio_events
  FOR EACH ROW EXECUTE FUNCTION prevent_faculty_portfolio_event_changes();

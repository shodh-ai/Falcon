-- Expand-only. No employee, legacy appraisal or credential rows are changed.
CREATE TABLE IF NOT EXISTS hr_api_policies (
  policy_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  entity_id int NOT NULL, designation varchar(140) NOT NULL, designation_key varchar(140) NOT NULL,
  assessment_year int NOT NULL CHECK (assessment_year BETWEEN 2000 AND 2200),
  version int NOT NULL CHECK (version > 0), revision int NOT NULL DEFAULT 1,
  title varchar(160) NOT NULL, sheet jsonb NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED')),
  origin varchar(40) NOT NULL DEFAULT 'HR_DEFINED', created_by uuid NOT NULL,
  request_id uuid NOT NULL, request_hash varchar(64) NOT NULL,
  published_by uuid, approval_reference text, created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz,
  UNIQUE (tenant_id, entity_id, designation_key, assessment_year, version),
  UNIQUE (tenant_id, entity_id, request_id),
  UNIQUE (tenant_id, entity_id, policy_id)
);
CREATE TABLE IF NOT EXISTS hr_api_policy_assignments (
  tenant_id uuid NOT NULL, entity_id int NOT NULL, designation_key varchar(140) NOT NULL,
  assessment_year int NOT NULL, policy_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, entity_id, designation_key, assessment_year),
  FOREIGN KEY (tenant_id,entity_id,policy_id) REFERENCES hr_api_policies(tenant_id,entity_id,policy_id)
);
CREATE TABLE IF NOT EXISTS hr_api_policy_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_sequence bigserial UNIQUE, tenant_id uuid NOT NULL, entity_id int NOT NULL,
  policy_id uuid NOT NULL, actor_user_id uuid NOT NULL, action varchar(30) NOT NULL,
  revision int NOT NULL, details jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,entity_id,policy_id) REFERENCES hr_api_policies(tenant_id,entity_id,policy_id)
);
CREATE TABLE IF NOT EXISTS hr_api_calculation_snapshots (
  snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, entity_id int NOT NULL,
  policy_id uuid NOT NULL, employee_user_id uuid NOT NULL, checked_by uuid NOT NULL,
  idempotency_key uuid NOT NULL, snapshot jsonb NOT NULL, sha256 varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,entity_id,idempotency_key),
  FOREIGN KEY (tenant_id,entity_id,policy_id) REFERENCES hr_api_policies(tenant_id,entity_id,policy_id)
);
CREATE OR REPLACE FUNCTION hr_api_preserve_published() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'PUBLISHED' THEN RAISE EXCEPTION 'Published API policies are immutable; create a new version'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hr_api_published_immutable ON hr_api_policies;
CREATE TRIGGER hr_api_published_immutable BEFORE UPDATE OR DELETE ON hr_api_policies
FOR EACH ROW EXECUTE FUNCTION hr_api_preserve_published();
CREATE OR REPLACE FUNCTION hr_api_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'API policy history and calculation snapshots are append-only'; END $$;
DROP TRIGGER IF EXISTS hr_api_events_immutable ON hr_api_policy_events;
CREATE TRIGGER hr_api_events_immutable BEFORE UPDATE OR DELETE ON hr_api_policy_events
FOR EACH ROW EXECUTE FUNCTION hr_api_history_immutable();
DROP TRIGGER IF EXISTS hr_api_snapshots_immutable ON hr_api_calculation_snapshots;
CREATE TRIGGER hr_api_snapshots_immutable BEFORE UPDATE OR DELETE ON hr_api_calculation_snapshots
FOR EACH ROW EXECUTE FUNCTION hr_api_history_immutable();

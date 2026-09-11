CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS platform_module_catalog (
  module_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  catalogue_version TEXT NOT NULL DEFAULT '1.0.0',
  definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_module_states (
  module_state_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key TEXT NOT NULL REFERENCES platform_module_catalog(module_key),
  tenant_id UUID REFERENCES tenants(tenant_id),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('GLOBAL','TENANT','CAMPUS','DEPARTMENT')),
  scope_id TEXT,
  state TEXT NOT NULL CHECK (state IN ('OFF','SHADOW','PILOT','ACTIVE','DRAINING','PAUSED')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  changed_by UUID REFERENCES users(user_id),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((scope_type = 'GLOBAL' AND tenant_id IS NULL AND scope_id IS NULL)
      OR (scope_type = 'TENANT' AND tenant_id IS NOT NULL AND scope_id IS NULL)
      OR (scope_type IN ('CAMPUS','DEPARTMENT') AND tenant_id IS NOT NULL AND scope_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_module_state_scope
  ON platform_module_states(module_key,tenant_id,scope_type,scope_id) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS idx_platform_module_states_runtime
  ON platform_module_states(tenant_id,module_key,scope_type,scope_id);

CREATE OR REPLACE FUNCTION platform_module_is_available(
  p_module_key TEXT,
  p_tenant_id UUID,
  p_campus_id TEXT DEFAULT NULL,
  p_department_id TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
  SELECT COALESCE((
    SELECT state = 'ACTIVE' OR (state = 'PILOT' AND scope_type IN ('CAMPUS','DEPARTMENT'))
    FROM platform_module_states
    WHERE module_key=p_module_key
      AND ((scope_type='GLOBAL' AND tenant_id IS NULL)
        OR (scope_type='TENANT' AND tenant_id=p_tenant_id)
        OR (scope_type='CAMPUS' AND tenant_id=p_tenant_id AND scope_id=p_campus_id)
        OR (scope_type='DEPARTMENT' AND tenant_id=p_tenant_id AND scope_id=p_department_id))
    ORDER BY CASE WHEN scope_type='GLOBAL' AND state='PAUSED' THEN 100 ELSE 0 END DESC,
             CASE scope_type WHEN 'DEPARTMENT' THEN 4 WHEN 'CAMPUS' THEN 3 WHEN 'TENANT' THEN 2 ELSE 1 END DESC
    LIMIT 1
  ), false);
$$ LANGUAGE SQL STABLE;

CREATE TABLE IF NOT EXISTS platform_module_rollouts (
  rollout_id UUID PRIMARY KEY,
  module_key TEXT NOT NULL REFERENCES platform_module_catalog(module_key),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('GLOBAL','TENANT','CAMPUS','DEPARTMENT')),
  scope_id TEXT,
  desired_state TEXT NOT NULL CHECK (desired_state IN ('OFF','SHADOW','PILOT','ACTIVE','DRAINING','PAUSED')),
  status TEXT NOT NULL CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','APPLIED','CANCELLED')),
  proposer_id UUID NOT NULL REFERENCES users(user_id),
  approver_id UUID REFERENCES users(user_id),
  reason TEXT NOT NULL,
  create_idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  submit_idempotency_key TEXT,
  approve_idempotency_key TEXT,
  readiness_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (proposer_id IS DISTINCT FROM approver_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_module_rollout_create_retry
  ON platform_module_rollouts(tenant_id,proposer_id,create_idempotency_key);

CREATE TABLE IF NOT EXISTS platform_module_handoffs (
  handoff_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  source_module TEXT NOT NULL REFERENCES platform_module_catalog(module_key),
  target_module TEXT NOT NULL REFERENCES platform_module_catalog(module_key),
  operation_type TEXT NOT NULL,
  source_aggregate_id TEXT NOT NULL,
  source_revision INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED','REJECTED','SUPERSEDED')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error JSONB,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,source_module,target_module,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_platform_module_handoffs_pending
  ON platform_module_handoffs(target_module,status,next_attempt_at);

CREATE TABLE IF NOT EXISTS platform_module_health_incidents (
  incident_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key TEXT NOT NULL REFERENCES platform_module_catalog(module_key),
  tenant_id UUID REFERENCES tenants(tenant_id),
  status TEXT NOT NULL CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  severity TEXT NOT NULL CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  summary TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  opened_by UUID REFERENCES users(user_id),
  resolved_by UUID REFERENCES users(user_id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS platform_module_activation_audit (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key TEXT NOT NULL REFERENCES platform_module_catalog(module_key),
  tenant_id UUID REFERENCES tenants(tenant_id),
  scope_type TEXT NOT NULL,
  scope_id TEXT,
  previous_state TEXT NOT NULL,
  new_state TEXT NOT NULL,
  revision INTEGER NOT NULL,
  actor_id UUID REFERENCES users(user_id),
  rollout_id UUID REFERENCES platform_module_rollouts(rollout_id),
  reason TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION prevent_platform_module_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'platform module activation audit is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_platform_module_audit_immutable ON platform_module_activation_audit;
CREATE TRIGGER trg_platform_module_audit_immutable
BEFORE UPDATE OR DELETE ON platform_module_activation_audit
FOR EACH ROW EXECUTE FUNCTION prevent_platform_module_audit_mutation();

INSERT INTO platform_module_catalog(module_key,display_name) VALUES
('admissions_onboarding','Admissions & Onboarding'),
('sis_academics','SIS / Academics'),
('examinations_credentials','Examinations & Credentials'),
('hrms_ess','HRMS & Employee Self-Service'),
('finance_procurement','Finance, Procurement & P2P'),
('inventory_assets','Inventory & Asset Lifecycle'),
('library','Library'),
('hostel_mess','Hostel & Mess'),
('transport','Transport'),
('helpdesk_esm','Helpdesk / ESM'),
('research_innovation','Research, PhD & Innovation'),
('placements_alumni','Placements & Alumni'),
('iqac_compliance','IQAC & Compliance'),
('clinic_safety','Clinic, Health & Safety'),
('campus_operations','Campus Operations'),
('leadership_reporting','Leadership, Analytics & Reporting')
ON CONFLICT(module_key) DO UPDATE SET display_name=EXCLUDED.display_name,updated_at=NOW();

-- Compatibility-safe bootstrap: current tenants retain the behavior they had
-- before this control plane existed. Newly created tenants have no rows and
-- therefore resolve to OFF until explicitly launched.
INSERT INTO platform_module_states(module_key,tenant_id,scope_type,state,reason)
SELECT c.module_key,t.tenant_id,'TENANT','ACTIVE','Existing tenant compatibility bootstrap'
FROM platform_module_catalog c CROSS JOIN tenants t
ON CONFLICT (module_key,tenant_id,scope_type,scope_id) DO NOTHING;

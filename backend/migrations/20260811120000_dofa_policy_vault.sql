-- DOFA Policy Vault: dual-key constitution + immutable audit stone

CREATE TABLE IF NOT EXISTS dofa_policy_graphs (
  graph_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  domain VARCHAR(40) NOT NULL,
  title TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','PENDING_CFO','PUBLISHED','REJECTED','SUPERSEDED')),
  graph_json JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  compiled_matrix JSONB NOT NULL DEFAULT '[]'::jsonb,
  minutes_ref TEXT,
  proposal_memo TEXT,
  proposed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  proposed_at TIMESTAMPTZ,
  unlocked_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  unlocked_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dofa_policy_graphs_tenant_domain
  ON dofa_policy_graphs(tenant_id, domain, status);
CREATE INDEX IF NOT EXISTS idx_dofa_policy_graphs_status
  ON dofa_policy_graphs(tenant_id, status);

CREATE TABLE IF NOT EXISTS dofa_policy_audit (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  graph_id UUID REFERENCES dofa_policy_graphs(graph_id) ON DELETE SET NULL,
  action VARCHAR(30) NOT NULL
    CHECK (action IN ('PROPOSE','SUBMIT','UNLOCK','REJECT','PUBLISH','VIEW')),
  actor_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  actor_role VARCHAR(64),
  before_json JSONB,
  after_json JSONB,
  minutes_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dofa_policy_audit_tenant
  ON dofa_policy_audit(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dofa_policy_otps (
  otp_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  graph_id UUID NOT NULL REFERENCES dofa_policy_graphs(graph_id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dofa_policy_otps_graph
  ON dofa_policy_otps(graph_id, created_at DESC);

-- Reuse fortress immutability helpers if present; else create
CREATE OR REPLACE FUNCTION fortress_block_immutable_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_LEDGER: updates are forbidden; issue a reversal instead';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fortress_block_immutable_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_LEDGER: deletes are forbidden; issue a reversal instead';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_dofa_policy_audit_no_update ON dofa_policy_audit;
CREATE TRIGGER tr_dofa_policy_audit_no_update
BEFORE UPDATE ON dofa_policy_audit
FOR EACH ROW EXECUTE FUNCTION fortress_block_immutable_update();

DROP TRIGGER IF EXISTS tr_dofa_policy_audit_no_delete ON dofa_policy_audit;
CREATE TRIGGER tr_dofa_policy_audit_no_delete
BEFORE DELETE ON dofa_policy_audit
FOR EACH ROW EXECUTE FUNCTION fortress_block_immutable_delete();

-- Seed PUBLISHED graphs from current live law (sgvu)
DO $$
DECLARE
  tid UUID;
  v_version INT := 1;
BEGIN
  SELECT tenant_id INTO tid FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF tid IS NULL THEN RETURN; END IF;

  -- P2P from fin_dofa_levels
  IF NOT EXISTS (
    SELECT 1 FROM dofa_policy_graphs
    WHERE tenant_id = tid AND domain = 'P2P' AND status = 'PUBLISHED'
  ) THEN
    INSERT INTO dofa_policy_graphs (
      tenant_id, domain, title, version, status, graph_json, compiled_matrix,
      minutes_ref, proposal_memo, published_at
    )
    SELECT
      tid,
      'P2P',
      'P2P Digital DOFA (seeded live law)',
      v_version,
      'PUBLISHED',
      jsonb_build_object(
        'nodes', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', 'L' || l.level_no,
              'type', 'band',
              'position', jsonb_build_object('x', 80, 'y', (l.level_no - 1) * 120),
              'data', jsonb_build_object(
                'level_no', l.level_no,
                'label', l.label,
                'amount_min', CASE WHEN l.level_no = 1 THEN 0
                  ELSE (SELECT max_amount_inr FROM fin_dofa_levels x
                        WHERE x.tenant_id = tid AND x.level_no = l.level_no - 1)
                END,
                'amount_max', l.max_amount_inr,
                'required_roles', to_jsonb(l.required_roles),
                'required_signatures', l.required_signatures
              )
            ) ORDER BY l.level_no
          )
          FROM fin_dofa_levels l WHERE l.tenant_id = tid
        ), '[]'::jsonb),
        'edges', '[]'::jsonb
      ),
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'level_no', l.level_no,
            'label', l.label,
            'max_amount_inr', l.max_amount_inr,
            'required_roles', to_jsonb(l.required_roles),
            'required_signatures', l.required_signatures
          ) ORDER BY l.level_no
        )
        FROM fin_dofa_levels l WHERE l.tenant_id = tid
      ), '[]'::jsonb),
      'SEED-INITIAL',
      'Initial constitution mirrored from fin_dofa_levels',
      NOW();
  END IF;

  -- Non-P2P domains from dofa_matrices
  INSERT INTO dofa_policy_graphs (
    tenant_id, domain, title, version, status, graph_json, compiled_matrix,
    minutes_ref, proposal_memo, published_at
  )
  SELECT
    tid,
    m.domain,
    m.domain || ' DOFA (seeded live law)',
    v_version,
    'PUBLISHED',
    jsonb_build_object(
      'nodes', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', r.rule_key,
            'type', 'band',
            'position', jsonb_build_object('x', 80, 'y', (ord - 1) * 120),
            'data', jsonb_build_object(
              'rule_key', r.rule_key,
              'amount_min', r.amount_min,
              'amount_max', r.amount_max,
              'required_roles', to_jsonb(r.required_roles),
              'required_signatures', r.required_signatures,
              'exception_escalate_role', r.exception_escalate_role
            )
          )
        )
        FROM (
          SELECT mm.*, row_number() OVER (ORDER BY mm.amount_min NULLS FIRST) AS ord
          FROM dofa_matrices mm
          WHERE mm.tenant_id = tid AND mm.domain = m.domain AND mm.is_active
        ) r
      ),
      'edges', '[]'::jsonb
    ),
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'rule_key', mm.rule_key,
          'amount_min', mm.amount_min,
          'amount_max', mm.amount_max,
          'required_roles', to_jsonb(mm.required_roles),
          'required_signatures', mm.required_signatures,
          'exception_escalate_role', mm.exception_escalate_role
        ) ORDER BY mm.amount_min NULLS FIRST
      )
      FROM dofa_matrices mm
      WHERE mm.tenant_id = tid AND mm.domain = m.domain AND mm.is_active
    ),
    'SEED-INITIAL',
    'Initial constitution mirrored from dofa_matrices',
    NOW()
  FROM (SELECT DISTINCT domain FROM dofa_matrices WHERE tenant_id = tid) m
  WHERE NOT EXISTS (
    SELECT 1 FROM dofa_policy_graphs g
    WHERE g.tenant_id = tid AND g.domain = m.domain AND g.status = 'PUBLISHED'
  );

  INSERT INTO dofa_policy_audit (tenant_id, graph_id, action, actor_role, after_json, minutes_ref)
  SELECT tid, g.graph_id, 'PUBLISH', 'SYSTEM',
         jsonb_build_object('status', 'PUBLISHED', 'domain', g.domain, 'version', g.version),
         'SEED-INITIAL'
  FROM dofa_policy_graphs g
  WHERE g.tenant_id = tid AND g.status = 'PUBLISHED'
    AND NOT EXISTS (
      SELECT 1 FROM dofa_policy_audit a WHERE a.graph_id = g.graph_id AND a.action = 'PUBLISH'
    );
END $$;

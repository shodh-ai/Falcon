-- Dynamic attendance rules engine (replaces single-row hr_attendance_rules config for cron evaluation).

CREATE TABLE IF NOT EXISTS hr_dynamic_rules (
  rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  entity_id INT NOT NULL REFERENCES org_entities(entity_id) ON DELETE CASCADE,
  rule_name VARCHAR(120) NOT NULL,
  condition_type VARCHAR(50) NOT NULL,
  operator VARCHAR(10) NOT NULL,
  threshold_value DECIMAL(10,2) NOT NULL,
  threshold_unit VARCHAR(20) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  action_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_dynamic_rules_entity
  ON hr_dynamic_rules(tenant_id, entity_id, is_active, priority);

-- Seed starter rules from legacy hr_attendance_rules (early going + late coming per entity)
INSERT INTO hr_dynamic_rules (
  tenant_id, entity_id, rule_name, condition_type, operator, threshold_value,
  threshold_unit, action_type, action_payload, priority, is_active
)
SELECT
  r.tenant_id,
  r.entity_id,
  'Early exit beyond grace',
  'PUNCH_OUT_EARLY',
  'GT',
  r.early_going_max_mins,
  'MINUTES',
  'DEDUCT_HALF_DAY',
  '{}'::jsonb,
  10,
  TRUE
FROM hr_attendance_rules r
WHERE NOT EXISTS (
  SELECT 1 FROM hr_dynamic_rules d
  WHERE d.tenant_id = r.tenant_id AND d.entity_id = r.entity_id
    AND d.rule_name = 'Early exit beyond grace'
);

INSERT INTO hr_dynamic_rules (
  tenant_id, entity_id, rule_name, condition_type, operator, threshold_value,
  threshold_unit, action_type, action_payload, priority, is_active
)
SELECT
  r.tenant_id,
  r.entity_id,
  'Excessive early exits (retroactive)',
  'OCCURRENCE_COUNT',
  'GTE',
  r.allowed_early_goings + 1,
  'OCCURRENCES',
  'RETROACTIVE_PENALTY',
  jsonb_build_object('days_deducted', r.retroactive_penalty_days, 'track_type', 'EARLY_GOING', 'max_mins', r.early_going_max_mins),
  20,
  TRUE
FROM hr_attendance_rules r
WHERE NOT EXISTS (
  SELECT 1 FROM hr_dynamic_rules d
  WHERE d.tenant_id = r.tenant_id AND d.entity_id = r.entity_id
    AND d.rule_name = 'Excessive early exits (retroactive)'
);

INSERT INTO hr_dynamic_rules (
  tenant_id, entity_id, rule_name, condition_type, operator, threshold_value,
  threshold_unit, action_type, action_payload, priority, is_active
)
SELECT
  r.tenant_id,
  r.entity_id,
  'Late punch-in beyond grace',
  'PUNCH_IN_LATE',
  'GT',
  r.late_coming_max_mins,
  'MINUTES',
  'DEDUCT_HALF_DAY',
  '{}'::jsonb,
  30,
  TRUE
FROM hr_attendance_rules r
WHERE NOT EXISTS (
  SELECT 1 FROM hr_dynamic_rules d
  WHERE d.tenant_id = r.tenant_id AND d.entity_id = r.entity_id
    AND d.rule_name = 'Late punch-in beyond grace'
);

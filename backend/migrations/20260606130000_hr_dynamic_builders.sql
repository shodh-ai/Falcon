-- Zimyo-grade dynamic builders: org units, leave policies, approval workflows, checklists.

CREATE TABLE IF NOT EXISTS hr_org_units (
  unit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  entity_id INT NOT NULL REFERENCES org_entities(entity_id) ON DELETE CASCADE,
  parent_id UUID NULL REFERENCES hr_org_units(unit_id) ON DELETE SET NULL,
  unit_type VARCHAR(50) NOT NULL,
  unit_name VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_org_units_tree ON hr_org_units(tenant_id, entity_id, parent_id);

ALTER TABLE hr_employee_profiles
  ADD COLUMN IF NOT EXISTS org_unit_id UUID NULL REFERENCES hr_org_units(unit_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS hr_leave_policies (
  policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  entity_id INT NOT NULL REFERENCES org_entities(entity_id) ON DELETE CASCADE,
  leave_name VARCHAR(100) NOT NULL,
  leave_code VARCHAR(20) NOT NULL,
  leave_count DECIMAL(5,2) NOT NULL,
  disbursement_cycle VARCHAR(50) NOT NULL,
  is_paid BOOLEAN NOT NULL DEFAULT TRUE,
  requires_document_proof BOOLEAN NOT NULL DEFAULT FALSE,
  allow_clubbing BOOLEAN NOT NULL DEFAULT FALSE,
  sandwich_rule_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sandwich_counts_weekends BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, entity_id, leave_code)
);

CREATE TABLE IF NOT EXISTS hr_leave_policy_balances (
  balance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES hr_leave_policies(policy_id) ON DELETE CASCADE,
  year INT NOT NULL,
  entitled DECIMAL(5,2) NOT NULL DEFAULT 0,
  used DECIMAL(5,2) NOT NULL DEFAULT 0,
  UNIQUE (user_id, policy_id, year)
);

CREATE TABLE IF NOT EXISTS hr_approval_workflows (
  workflow_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  entity_id INT NOT NULL REFERENCES org_entities(entity_id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL,
  workflow_name VARCHAR(120) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_approval_workflow_steps (
  step_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES hr_approval_workflows(workflow_id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  approver_type VARCHAR(50) NOT NULL,
  approver_ref VARCHAR(120) NULL,
  UNIQUE (workflow_id, step_order)
);

CREATE TABLE IF NOT EXISTS hr_workflow_checklists (
  template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  entity_id INT NOT NULL REFERENCES org_entities(entity_id) ON DELETE CASCADE,
  workflow_type VARCHAR(50) NOT NULL,
  task_name VARCHAR(255) NOT NULL,
  is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_to_role VARCHAR(50) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_checklist_instances (
  instance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES hr_workflow_checklists(template_id) ON DELETE CASCADE,
  pipeline_id UUID NULL,
  resignation_id UUID NULL,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  completed_at TIMESTAMPTZ NULL,
  completed_by UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE hr_resignation_requests
  ADD COLUMN IF NOT EXISTS fnf_deduct_checklist_penalty BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE hr_resignation_requests
  ADD COLUMN IF NOT EXISTS exit_status VARCHAR(40) NOT NULL DEFAULT 'PENDING_CLEARANCE';

-- Zimyo-style onboarding workflow engine: configurable templates + per-employee task tracker.

CREATE TABLE IF NOT EXISTS hr_workflow_templates (
  template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  entity_id INT NOT NULL REFERENCES org_entities(entity_id) ON DELETE CASCADE,
  workflow_type VARCHAR(50) NOT NULL DEFAULT 'ONBOARDING',
  stage_name VARCHAR(100) NOT NULL,
  task_name VARCHAR(255) NOT NULL,
  is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  step_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, entity_id, workflow_type, stage_name, task_name)
);

CREATE INDEX IF NOT EXISTS idx_hr_workflow_templates_lookup
  ON hr_workflow_templates(tenant_id, entity_id, workflow_type, stage_name, step_order);

CREATE TABLE IF NOT EXISTS hr_employee_onboarding_tasks (
  task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  entity_id INT NOT NULL REFERENCES org_entities(entity_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES hr_workflow_templates(template_id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED')),
  completed_at TIMESTAMPTZ NULL,
  completed_by UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_employee_onboarding_tasks_user
  ON hr_employee_onboarding_tasks(tenant_id, entity_id, user_id);

-- Default Zimyo "Default Workflow" tasks for SGVU University
WITH ctx AS (
  SELECT t.tenant_id, oe.entity_id
  FROM public.tenants t
  JOIN org_entities oe ON oe.tenant_id = t.tenant_id AND oe.entity_code = 'SGVU_UNIVERSITY'
  WHERE t.subdomain = 'sgvu'
  LIMIT 1
)
INSERT INTO hr_workflow_templates (tenant_id, entity_id, workflow_type, stage_name, task_name, is_mandatory, step_order)
SELECT ctx.tenant_id, ctx.entity_id, 'ONBOARDING', data.stage, data.task, data.mandatory, data.ord
FROM ctx
CROSS JOIN (VALUES
  ('Offer Management', 'CTC Approval', true, 1),
  ('Offer Management', 'Letter of Intent', true, 2),
  ('Offer Management', 'Offer Letter Generation', true, 3),
  ('Offer Management', 'Background Verification Initiation', false, 4),
  ('Candidate Onboarding', 'Welcome Mail', true, 1),
  ('Candidate Onboarding', 'Verify Candidate Details', true, 2),
  ('Candidate Onboarding', 'Verify Aadhaar', true, 3),
  ('Candidate Onboarding', 'Verify PAN', true, 4),
  ('Candidate Onboarding', 'Collect Joining Documents', true, 5),
  ('Candidate Onboarding', 'Create Employee ID', true, 6),
  ('Employee Onboarding', 'Assign Assets (Laptop / ID Card)', true, 1),
  ('Employee Onboarding', 'IT Access & Email Provisioning', true, 2),
  ('Employee Onboarding', 'Policy Acknowledgement', true, 3),
  ('Employee Onboarding', 'Department Introduction', false, 4),
  ('Employee Onboarding', 'Payroll & Bank Details Setup', true, 5),
  ('Employee Onboarding', 'First Week Check-in', false, 6)
) AS data(stage, task, mandatory, ord)
ON CONFLICT (tenant_id, entity_id, workflow_type, stage_name, task_name) DO NOTHING;

-- Backfill onboarding tasks for already-hired applicants with user accounts
WITH ctx AS (
  SELECT t.tenant_id, oe.entity_id
  FROM public.tenants t
  JOIN org_entities oe ON oe.tenant_id = t.tenant_id AND oe.entity_code = 'SGVU_UNIVERSITY'
  WHERE t.subdomain = 'sgvu'
  LIMIT 1
),
hired AS (
  SELECT DISTINCT a.hired_user_id AS user_id
  FROM hr_applicants a
  JOIN ctx ON a.tenant_id = ctx.tenant_id
  WHERE a.stage = 'HIRED' AND a.hired_user_id IS NOT NULL
)
INSERT INTO hr_employee_onboarding_tasks (tenant_id, entity_id, user_id, template_id, status)
SELECT ctx.tenant_id, ctx.entity_id, h.user_id, wt.template_id, 'PENDING'
FROM ctx, hired h
CROSS JOIN hr_workflow_templates wt
WHERE wt.tenant_id = ctx.tenant_id
  AND wt.entity_id = ctx.entity_id
  AND wt.workflow_type = 'ONBOARDING'
ON CONFLICT (user_id, template_id) DO NOTHING;

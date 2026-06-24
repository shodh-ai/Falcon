-- HR admin workflow override audit log (referenced by hr-workforce + super-admin override logs)

CREATE TABLE IF NOT EXISTS hr_override_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  employee_id VARCHAR(255) NOT NULL,
  assigned_approver VARCHAR(255),
  bypassed_by VARCHAR(255),
  type_of_action VARCHAR(100) NOT NULL,
  type_of_request VARCHAR(100) NOT NULL,
  date_and_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_override_logs_tenant_time
  ON hr_override_logs(tenant_id, date_and_time DESC);

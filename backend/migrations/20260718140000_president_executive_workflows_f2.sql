-- Phase F.2 — President executive workflow completion

CREATE TABLE IF NOT EXISTS leadership_executive_orders (
  order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  order_code VARCHAR(40) NOT NULL,
  subject VARCHAR(240) NOT NULL,
  body TEXT NOT NULL,
  order_type VARCHAR(40) NOT NULL DEFAULT 'DIRECTIVE'
    CHECK (order_type IN ('DIRECTIVE', 'DISCIPLINARY', 'EMERGENCY', 'ADMINISTRATIVE')),
  destination_module VARCHAR(40) NOT NULL
    CHECK (destination_module IN ('REGISTRAR', 'DEAN', 'FINANCE', 'HR', 'IQAC', 'OPERATIONS')),
  destination_role VARCHAR(40) NULL,
  assigned_to_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ISSUED'
    CHECK (status IN ('ISSUED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  issued_by UUID NOT NULL REFERENCES users(user_id),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL,
  linked_task_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, order_code)
);

CREATE INDEX IF NOT EXISTS idx_leadership_exec_orders_tenant_status
  ON leadership_executive_orders(tenant_id, status, issued_at DESC);

CREATE TABLE IF NOT EXISTS meeting_executive_action_items (
  action_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES portal_meetings(meeting_id) ON DELETE CASCADE,
  minutes_id UUID NULL REFERENCES portal_meeting_minutes(minutes_id) ON DELETE SET NULL,
  title VARCHAR(240) NOT NULL,
  assigned_to_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES users(user_id),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  due_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  reminder_sent_at TIMESTAMPTZ NULL,
  linked_executive_task_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_exec_actions_assignee
  ON meeting_executive_action_items(tenant_id, assigned_to_user_id, status);

ALTER TABLE cert_applications
  ADD COLUMN IF NOT EXISTS president_ratification_status VARCHAR(30) DEFAULT 'PENDING'
    CHECK (president_ratification_status IN ('PENDING', 'RATIFIED', 'REJECTED', 'NOT_REQUIRED'));

ALTER TABLE cert_applications
  ADD COLUMN IF NOT EXISTS president_ratified_at TIMESTAMPTZ NULL;

ALTER TABLE cert_applications
  ADD COLUMN IF NOT EXISTS president_ratified_by UUID NULL REFERENCES users(user_id);

ALTER TABLE helpdesk_tickets
  ADD COLUMN IF NOT EXISTS president_decision TEXT NULL;

ALTER TABLE helpdesk_tickets
  ADD COLUMN IF NOT EXISTS assigned_officer_user_id UUID NULL REFERENCES users(user_id);

ALTER TABLE helpdesk_tickets
  ADD COLUMN IF NOT EXISTS president_escalated_at TIMESTAMPTZ NULL;

ALTER TABLE helpdesk_tickets
  ADD COLUMN IF NOT EXISTS president_escalated_by UUID NULL REFERENCES users(user_id);

ALTER TABLE executive_hr_approval_requests
  ADD COLUMN IF NOT EXISTS review_note TEXT NULL;

UPDATE cert_applications
SET president_ratification_status = 'NOT_REQUIRED'
WHERE president_ratification_status IS NULL;

UPDATE cert_applications
SET president_ratification_status = 'PENDING'
WHERE verification_status = 'VERIFIED'
  AND certificate_generated = false
  AND president_ratification_status IN ('PENDING', 'NOT_REQUIRED');

-- President executive access (same pattern as Chairman)
WITH t AS (
  SELECT tenant_id FROM tenants WHERE subdomain = 'sgvu' LIMIT 1
),
pres AS (
  SELECT user_id FROM users
  WHERE lower(official_email) = 'president@mygyanvihar.com'
  LIMIT 1
)
INSERT INTO owner_access_control (tenant_id, user_id, role_label, is_active)
SELECT t.tenant_id, pres.user_id, 'President', true
FROM t, pres
WHERE pres.user_id IS NOT NULL
ON CONFLICT (tenant_id, user_id) DO UPDATE SET is_active = true, role_label = 'President';

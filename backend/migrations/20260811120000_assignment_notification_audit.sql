-- Assignment publish targeting + notification delivery audit.

ALTER TABLE academic_assignments
  ADD COLUMN IF NOT EXISTS semester INT NULL,
  ADD COLUMN IF NOT EXISTS section_code VARCHAR(10) NULL,
  ADD COLUMN IF NOT EXISTS notifications_sent_at TIMESTAMPTZ NULL;

CREATE TABLE IF NOT EXISTS assignment_notification_audits (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES academic_assignments(assignment_id) ON DELETE CASCADE,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  students_targeted INT NOT NULL DEFAULT 0,
  students_notified INT NOT NULL DEFAULT 0,
  delivery_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  failed_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_summary TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT uq_assignment_notification_audits_assignment
    UNIQUE (tenant_id, assignment_id)
);

CREATE INDEX IF NOT EXISTS idx_assignment_notification_audits_status
  ON assignment_notification_audits (tenant_id, delivery_status, updated_at DESC);

-- Seen time for notification recipients (read tracking).
ALTER TABLE falcon_notifications
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ NULL;

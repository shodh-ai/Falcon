-- Global search (pg_trgm) + Helpdesk SLA / escalation columns

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_users_name_trgm ON users USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_email_trgm ON users USING gin (official_email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_student_profiles_enrollment_trgm
  ON student_profiles USING gin (enrollment_no gin_trgm_ops)
  WHERE enrollment_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hr_employee_id_trgm
  ON hr_employee_profiles USING gin (employee_id gin_trgm_ops);

ALTER TABLE helpdesk_tickets ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(tenant_id);
ALTER TABLE helpdesk_tickets ADD COLUMN IF NOT EXISTS sla_deadline TIMESTAMPTZ;
ALTER TABLE helpdesk_tickets ADD COLUMN IF NOT EXISTS escalation_level INT NOT NULL DEFAULT 0;
ALTER TABLE helpdesk_tickets ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(user_id);
ALTER TABLE helpdesk_tickets ADD COLUMN IF NOT EXISTS resolution_time_hours DECIMAL(5, 2);
ALTER TABLE helpdesk_tickets ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

UPDATE helpdesk_tickets t
SET tenant_id = u.tenant_id
FROM users u
WHERE t.student_user_id = u.user_id AND t.tenant_id IS NULL;

UPDATE helpdesk_tickets
SET sla_deadline = created_at + INTERVAL '48 hours'
WHERE sla_deadline IS NULL;

CREATE INDEX IF NOT EXISTS idx_helpdesk_sla_breach
  ON helpdesk_tickets(tenant_id, status, sla_deadline)
  WHERE status != 'RESOLVED';

CREATE INDEX IF NOT EXISTS idx_helpdesk_escalation
  ON helpdesk_tickets(tenant_id, escalation_level, status);

-- Demo SLA-breached tickets for leadership issues dashboard
WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
student AS (SELECT user_id FROM users WHERE official_email = 'student1@mygyanvihar.com' LIMIT 1)
INSERT INTO helpdesk_tickets (
  tenant_id, student_user_id, category, subject, description, status,
  sla_deadline, escalation_level, created_at
)
SELECT t.tenant_id, s.user_id, v.category, v.subject, v.description, 'PENDING',
       NOW() - INTERVAL '12 hours', v.escalation, NOW() - INTERVAL '60 hours'
FROM tenant t
CROSS JOIN student s
CROSS JOIN (VALUES
  ('HOSTEL', 'Broken hostel fan — Room 204', 'Fan not working for 3 days', 1),
  ('IT', 'Campus Wi-Fi down in Library block', 'No connectivity since Monday', 0),
  ('ACADEMICS', 'Grading error in Mid-Sem marks', 'Physics internal marks mismatch', 1)
) AS v(category, subject, description, escalation)
WHERE NOT EXISTS (
  SELECT 1 FROM helpdesk_tickets existing
  WHERE existing.subject = v.subject AND existing.student_user_id = s.user_id
);

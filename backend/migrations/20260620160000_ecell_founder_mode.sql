-- E-Cell Founder Mode: workspaces, bookings, mentor meetings

CREATE TABLE IF NOT EXISTS ecell_workspaces (
  workspace_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  capacity INT,
  amenities JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ecell_workspace_bookings (
  booking_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES ecell_workspaces(workspace_id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES ecell_projects(project_id) ON DELETE CASCADE,
  booked_by_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  purpose VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'CONFIRMED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ecell_workspace_booking_status_check CHECK (status IN ('CONFIRMED', 'CANCELLED')),
  CONSTRAINT ecell_workspace_booking_time_check CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS ecell_mentor_meetings (
  meeting_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES ecell_projects(project_id) ON DELETE CASCADE,
  requested_by_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  mentor_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  topic VARCHAR(255) NOT NULL,
  requested_time TIMESTAMPTZ NOT NULL,
  meeting_link TEXT,
  decline_reason TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  mentor_feedback TEXT,
  feedback_requested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ecell_mentor_meeting_status_check CHECK (
    status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'COMPLETED')
  )
);

CREATE INDEX IF NOT EXISTS idx_ecell_workspaces_tenant_active
  ON ecell_workspaces(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ecell_workspace_bookings_workspace_time
  ON ecell_workspace_bookings(workspace_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_ecell_workspace_bookings_project_week
  ON ecell_workspace_bookings(project_id, start_time);
CREATE INDEX IF NOT EXISTS idx_ecell_mentor_meetings_mentor_status
  ON ecell_mentor_meetings(mentor_user_id, status, requested_time DESC);
CREATE INDEX IF NOT EXISTS idx_ecell_mentor_meetings_founder
  ON ecell_mentor_meetings(requested_by_user_id, created_at DESC);

INSERT INTO ecell_workspaces (tenant_id, name, capacity, amenities)
SELECT t.tenant_id, w.name, w.capacity, w.amenities::jsonb
FROM tenants t
CROSS JOIN (
  VALUES
    ('Conference Room A', 12, '["Projector", "Whiteboard", "Video Conferencing"]'),
    ('Conference Room B', 8, '["Whiteboard", "TV Display"]'),
    ('Cubicle 4', 4, '["Wi-Fi", "Power Outlets"]')
) AS w(name, capacity, amenities)
WHERE t.subdomain = 'sgvu'
  AND NOT EXISTS (
    SELECT 1 FROM ecell_workspaces ew WHERE ew.tenant_id = t.tenant_id AND ew.name = w.name
  );

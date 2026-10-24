-- Delegated academic observation. No source faculty assignments are copied or changed.
CREATE TABLE IF NOT EXISTS faculty_read_only_viewers (
  viewer_user_id UUID PRIMARY KEY REFERENCES users(user_id),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  source_user_id UUID NOT NULL REFERENCES users(user_id),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (viewer_user_id <> source_user_id)
);
INSERT INTO roles(role_name) SELECT 'FacultyReadOnly'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE role_name='FacultyReadOnly');

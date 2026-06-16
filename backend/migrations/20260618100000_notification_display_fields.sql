-- Richer notification display fields for action-center UI.

ALTER TABLE falcon_notifications
  ADD COLUMN IF NOT EXISTS severity VARCHAR(20) NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS intent VARCHAR(30) NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS action_label VARCHAR(100),
  ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_falcon_notifications_tenant_user_created
  ON falcon_notifications(tenant_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_falcon_notifications_tenant_user_unread
  ON falcon_notifications(tenant_id, user_id)
  WHERE is_read = false AND deleted_at IS NULL;

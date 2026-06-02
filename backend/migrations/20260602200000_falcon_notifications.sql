-- Centralized in-app notifications + library loan tracking for overdue alerts.

CREATE TABLE IF NOT EXISTS falcon_notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  action_link VARCHAR(255),
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_falcon_notifications_user_created
  ON falcon_notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON falcon_notifications(user_id) WHERE is_read = false;

-- Library circulation for overdue cron (student portal had no loan table).
CREATE TABLE IF NOT EXISTS operations_library_loans (
  loan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  book_id INT NOT NULL REFERENCES operations_library_books(book_id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  returned_at TIMESTAMPTZ NULL,
  overdue_notified_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_library_loans_overdue
  ON operations_library_loans(student_user_id, due_date)
  WHERE returned_at IS NULL;

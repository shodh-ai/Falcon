-- Expand-only: retain the exact intervention reason and actor at the decision time.
ALTER TABLE hr_override_logs
  ADD COLUMN IF NOT EXISTS actor_user_id uuid,
  ADD COLUMN IF NOT EXISTS leave_id uuid,
  ADD COLUMN IF NOT EXISTS step_order integer,
  ADD COLUMN IF NOT EXISTS reason text;

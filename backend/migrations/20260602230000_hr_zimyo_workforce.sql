-- Zimyo-style HR: holidays, daily biometric attendance, expanded leave/OD requests.

CREATE TABLE IF NOT EXISTS hr_holidays (
  holiday_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'MANDATORY',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_holidays_date ON hr_holidays(date);

CREATE TABLE IF NOT EXISTS hr_daily_attendance (
  record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  first_in_time TIMESTAMPTZ,
  last_out_time TIMESTAMPTZ,
  total_hours DECIMAL(5,2),
  status VARCHAR(50) NOT NULL DEFAULT 'ABSENT',
  is_regularized BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_hr_daily_attendance_user_date ON hr_daily_attendance(user_id, date DESC);

ALTER TABLE staff_leave_requests
  ADD COLUMN IF NOT EXISTS request_type VARCHAR(50) NOT NULL DEFAULT 'LEAVE';

ALTER TABLE staff_leave_requests
  ADD COLUMN IF NOT EXISTS regularization_date DATE;

ALTER TABLE staff_leave_requests
  ADD COLUMN IF NOT EXISTS missed_punch_type VARCHAR(10);

-- Seed Indian university holidays (2026)
INSERT INTO hr_holidays (title, date, type, description) VALUES
  ('Republic Day', '2026-01-26', 'MANDATORY', 'National holiday'),
  ('Holi', '2026-03-14', 'MANDATORY', 'Festival holiday'),
  ('Independence Day', '2026-08-15', 'MANDATORY', 'National holiday'),
  ('Gandhi Jayanti', '2026-10-02', 'MANDATORY', 'National holiday'),
  ('Diwali', '2026-11-08', 'MANDATORY', 'Festival holiday'),
  ('Christmas', '2026-12-25', 'MANDATORY', 'Festival holiday'),
  ('Restricted Holiday (RH)', '2026-01-14', 'RESTRICTED', 'Optional — Makar Sankranti'),
  ('Restricted Holiday (RH)', '2026-08-28', 'RESTRICTED', 'Optional — Raksha Bandhan')
;

-- Backfill daily attendance from legacy web/biometric punches where present
INSERT INTO hr_daily_attendance (user_id, date, first_in_time, last_out_time, total_hours, status, is_regularized)
SELECT
  a.user_id,
  a.work_date::date,
  a.check_in_at,
  a.check_out_at,
  CASE
    WHEN a.check_in_at IS NOT NULL AND a.check_out_at IS NOT NULL
    THEN ROUND((EXTRACT(EPOCH FROM (a.check_out_at - a.check_in_at)) / 3600.0)::numeric, 2)
    WHEN a.check_in_at IS NOT NULL THEN 0
    ELSE NULL
  END,
  CASE
    WHEN a.check_in_at IS NOT NULL AND a.check_out_at IS NULL THEN 'MISSED_PUNCH'
    WHEN a.check_in_at IS NOT NULL THEN 'PRESENT'
    ELSE 'ABSENT'
  END,
  false
FROM hr_staff_attendance a
ON CONFLICT (user_id, date) DO NOTHING;

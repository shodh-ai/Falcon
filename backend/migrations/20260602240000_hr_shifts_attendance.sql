-- Dynamic shifts + granular calculated_status for enterprise attendance.

CREATE TABLE IF NOT EXISTS hr_shifts (
  shift_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_name VARCHAR(50) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  grace_period_mins INT NOT NULL DEFAULT 15,
  half_day_min_hours DECIMAL(4,2) NOT NULL DEFAULT 4.0,
  full_day_min_hours DECIMAL(4,2) NOT NULL DEFAULT 8.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO hr_shifts (shift_name, start_time, end_time, grace_period_mins, half_day_min_hours, full_day_min_hours)
SELECT 'General 9-5', '09:00', '17:00', 15, 4.0, 8.0
WHERE NOT EXISTS (SELECT 1 FROM hr_shifts WHERE shift_name = 'General 9-5');

INSERT INTO hr_shifts (shift_name, start_time, end_time, grace_period_mins, half_day_min_hours, full_day_min_hours)
SELECT 'Late 10-6', '10:00', '18:00', 15, 4.0, 8.0
WHERE NOT EXISTS (SELECT 1 FROM hr_shifts WHERE shift_name = 'Late 10-6');

ALTER TABLE hr_employee_profiles
  ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES hr_shifts(shift_id);

ALTER TABLE hr_employee_profiles
  ADD COLUMN IF NOT EXISTS week_off_day INT NOT NULL DEFAULT 0;

UPDATE hr_employee_profiles ep
SET shift_id = (SELECT shift_id FROM hr_shifts WHERE shift_name = 'General 9-5' LIMIT 1)
WHERE ep.shift_id IS NULL;

ALTER TABLE hr_daily_attendance
  ADD COLUMN IF NOT EXISTS calculated_status VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_hr_employee_profiles_shift ON hr_employee_profiles(shift_id);

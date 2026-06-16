-- Remove duplicate holiday rows (same title + date + entity) — keeps oldest row per group.
DELETE FROM hr_holidays h
WHERE h.holiday_id NOT IN (
  SELECT DISTINCT ON (COALESCE(entity_id, -1), date, title) holiday_id
  FROM hr_holidays
  ORDER BY COALESCE(entity_id, -1), date, title, created_at ASC, holiday_id ASC
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_holidays_entity_date_title
  ON hr_holidays (COALESCE(entity_id, -1), date, title)
  WHERE deleted_at IS NULL;

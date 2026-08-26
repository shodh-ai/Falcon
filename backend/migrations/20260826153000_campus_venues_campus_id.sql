-- Scope campus venues to a campus for Campus Admin isolation.
-- Single-campus tenants: backfill all venues to the only campus.
-- Multi-campus: venues without a match stay NULL until assigned.

ALTER TABLE campus_venues
  ADD COLUMN IF NOT EXISTS campus_id INT NULL REFERENCES campuses(campus_id);

CREATE INDEX IF NOT EXISTS idx_campus_venues_campus
  ON campus_venues(campus_id)
  WHERE campus_id IS NOT NULL;

-- Backfill when the tenant has exactly one active campus
UPDATE campus_venues v
SET campus_id = c.campus_id
FROM (
  SELECT t.tenant_id, MIN(c.campus_id) AS campus_id
  FROM tenants t
  JOIN campuses c ON c.deleted_at IS NULL
  GROUP BY t.tenant_id
  HAVING COUNT(*) = 1
) one
JOIN campuses c ON c.campus_id = one.campus_id
WHERE v.tenant_id = one.tenant_id
  AND v.campus_id IS NULL;

-- For multi-campus tenants with a single common campus code fallback: leave NULL
-- Campus Admin listings will only show venues with matching campus_id.

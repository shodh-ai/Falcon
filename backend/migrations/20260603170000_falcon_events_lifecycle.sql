-- Falcon Events: master calendar, multi-tier approvals, attendance / IQAC hook

CREATE TABLE IF NOT EXISTS campus_master_calendar (
  calendar_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  is_blocked_for_events BOOLEAN NOT NULL DEFAULT true,
  academic_year VARCHAR(12),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, date)
);

CREATE INDEX IF NOT EXISTS idx_campus_master_calendar_tenant_date
  ON campus_master_calendar(tenant_id, date);

ALTER TABLE campus_events
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES university_assets(asset_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS guest_speakers TEXT,
  ADD COLUMN IF NOT EXISTS advisor_approval VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS estate_approval VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS finance_approval VARCHAR(20) NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS estate_notes TEXT,
  ADD COLUMN IF NOT EXISTS finance_ledger_code VARCHAR(40) DEFAULT 'EVENTS_CLUB';

ALTER TABLE event_registrations
  ADD COLUMN IF NOT EXISTS attended BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scanned_by UUID REFERENCES users(user_id) ON DELETE SET NULL;

-- Backfill seeded / legacy APPROVED events to LIVE with tiers complete
UPDATE campus_events
SET status = 'LIVE',
    advisor_approval = 'APPROVED',
    estate_approval = 'APPROVED',
    finance_approval = CASE WHEN is_paid THEN 'APPROVED' ELSE 'NOT_REQUIRED' END
WHERE status = 'APPROVED';

-- Demo blocked dates (SGVU academic year)
INSERT INTO campus_master_calendar (tenant_id, date, title, description, academic_year)
SELECT t.tenant_id, d.dt::date, d.title, d.descr, '2025-26'
FROM tenants t
CROSS JOIN (VALUES
  ((CURRENT_DATE + INTERVAL '30 days')::date, 'Mid-Term Examinations', 'No club events during mid-term exam window'),
  ((CURRENT_DATE + INTERVAL '60 days')::date, 'National Holiday', 'Republic Day observance'),
  ((CURRENT_DATE + INTERVAL '90 days')::date, 'End-Term Examinations', 'Final examination period'),
  ((CURRENT_DATE + INTERVAL '120 days')::date, 'Convocation', 'Annual convocation ceremony')
) AS d(dt, title, descr)
WHERE t.subdomain = 'sgvu'
ON CONFLICT (tenant_id, date) DO NOTHING;

-- Venue assets for estate booking
INSERT INTO university_assets (tenant_id, asset_tag, asset_type, name, assigned_room, status)
SELECT t.tenant_id, v.tag, 'VENUE', v.name, v.room, 'AVAILABLE'
FROM tenants t
CROSS JOIN (VALUES
  ('VENUE-AUD-01', 'Main Auditorium', 'Main Auditorium Block'),
  ('VENUE-SEM-B', 'Seminar Hall B', 'Academic Block B')
) AS v(tag, name, room)
WHERE t.subdomain = 'sgvu'
  AND NOT EXISTS (
    SELECT 1 FROM university_assets ua
    WHERE ua.tenant_id = t.tenant_id AND ua.asset_tag = v.tag
  );

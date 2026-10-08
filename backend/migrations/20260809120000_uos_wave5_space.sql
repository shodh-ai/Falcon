-- UOS Wave 5: Space booking DOFA (Mentor → Estate → Security)

ALTER TABLE venue_bookings
  ADD COLUMN IF NOT EXISTS dofa_status VARCHAR(40) DEFAULT 'PENDING_MENTOR',
  ADD COLUMN IF NOT EXISTS mentor_by UUID REFERENCES users(user_id),
  ADD COLUMN IF NOT EXISTS mentor_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS estate_by UUID REFERENCES users(user_id),
  ADD COLUMN IF NOT EXISTS estate_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS security_by UUID REFERENCES users(user_id),
  ADD COLUMN IF NOT EXISTS security_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS club_name TEXT,
  ADD COLUMN IF NOT EXISTS requires_crowd_control BOOLEAN NOT NULL DEFAULT false;

UPDATE venue_bookings
SET dofa_status = COALESCE(dofa_status, CASE
  WHEN upper(COALESCE(status,'')) IN ('APPROVED','CONFIRMED') THEN 'CONFIRMED'
  ELSE 'PENDING_MENTOR'
END)
WHERE dofa_status IS NULL OR dofa_status = 'PENDING_MENTOR';

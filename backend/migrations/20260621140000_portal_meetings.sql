-- Portal meetings: hierarchy-aware scheduling, requests, agenda, and minutes.

CREATE TABLE IF NOT EXISTS portal_meetings (
  meeting_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  organizer_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  requester_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  venue VARCHAR(180) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  agenda TEXT NULL,
  meeting_mode VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED'
    CHECK (meeting_mode IN ('SCHEDULED', 'REQUESTED')),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED')),
  scope_note VARCHAR(120) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portal_meeting_participants (
  participant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES portal_meetings(meeting_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  participant_role VARCHAR(20) NOT NULL DEFAULT 'INVITEE'
    CHECK (participant_role IN ('ORGANIZER', 'INVITEE', 'ATTENDEE')),
  rsvp_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (rsvp_status IN ('PENDING', 'ACCEPTED', 'DECLINED')),
  response_note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (meeting_id, user_id)
);

CREATE TABLE IF NOT EXISTS portal_meeting_minutes (
  minutes_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL UNIQUE REFERENCES portal_meetings(meeting_id) ON DELETE CASCADE,
  notes TEXT NOT NULL DEFAULT '',
  decisions TEXT NULL,
  action_items TEXT NULL,
  created_by UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  updated_by UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_meetings_tenant_starts
  ON portal_meetings(tenant_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_meetings_organizer
  ON portal_meetings(organizer_user_id, status, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_meeting_participants_user
  ON portal_meeting_participants(user_id, rsvp_status);
CREATE INDEX IF NOT EXISTS idx_portal_meeting_participants_meeting
  ON portal_meeting_participants(meeting_id);

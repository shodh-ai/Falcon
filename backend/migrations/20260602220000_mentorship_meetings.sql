-- Persistent proctor meeting requests (VTOP-style mentorship loop).

CREATE TABLE IF NOT EXISTS mentorship_meetings (
  meeting_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  proctor_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  requested_time TIMESTAMPTZ NOT NULL,
  topic VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  proctor_remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mentorship_meetings_proctor_status
  ON mentorship_meetings(proctor_user_id, status, requested_time DESC);

CREATE INDEX IF NOT EXISTS idx_mentorship_meetings_student
  ON mentorship_meetings(student_user_id, requested_time DESC);

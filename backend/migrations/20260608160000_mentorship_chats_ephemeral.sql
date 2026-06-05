-- Ephemeral mentorship chat (auto-deleted after 7 days; separate from helpdesk_tickets).

CREATE TABLE IF NOT EXISTS mentorship_chats (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  proctor_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('STUDENT', 'FACULTY')),
  message_text TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mentorship_chats_thread
  ON mentorship_chats(student_user_id, proctor_user_id, sent_at);

CREATE INDEX IF NOT EXISTS idx_mentorship_chats_proctor_unread
  ON mentorship_chats(proctor_user_id, is_read)
  WHERE sender_type = 'STUDENT' AND is_read = false;

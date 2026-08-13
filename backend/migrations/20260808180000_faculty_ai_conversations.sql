-- Faculty AI Copilot: conversation history + messages (tenant + faculty scoped).

CREATE TABLE IF NOT EXISTS faculty_ai_conversations (
  conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL DEFAULT 'New conversation',
  prompt_type VARCHAR(80) NULL,
  token_usage INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_faculty_ai_conversations_owner
  ON faculty_ai_conversations (tenant_id, faculty_user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS faculty_ai_messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  conversation_id UUID NOT NULL REFERENCES faculty_ai_conversations(conversation_id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  prompt_type VARCHAR(80) NULL,
  token_usage INT NOT NULL DEFAULT 0,
  attachments JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_faculty_ai_messages_thread
  ON faculty_ai_messages (tenant_id, conversation_id, created_at)
  WHERE deleted_at IS NULL;

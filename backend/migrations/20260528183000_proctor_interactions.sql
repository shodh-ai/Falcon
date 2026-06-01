CREATE TABLE IF NOT EXISTS academic_proctor_interactions (
  interaction_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  proctor_user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  interaction_type varchar(20) NOT NULL CHECK (interaction_type IN ('MEETING', 'MESSAGE', 'LEAVE_REQUEST')),
  payload jsonb NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proctor_interactions_student ON academic_proctor_interactions (student_user_id);
CREATE INDEX IF NOT EXISTS idx_proctor_interactions_proctor ON academic_proctor_interactions (proctor_user_id);

CREATE TABLE IF NOT EXISTS academic_mentorships (
  mentorship_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id uuid NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  proctor_user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  assigned_by_user_id uuid NULL REFERENCES users(user_id) ON DELETE SET NULL,
  active_from date NULL,
  active_till date NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_academic_mentorships_proctor ON academic_mentorships (proctor_user_id);

CREATE TABLE IF NOT EXISTS student_profiles (
  profile_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  blood_group varchar(5) NULL,
  parent_contacts jsonb NULL,
  address jsonb NULL,
  bank_details jsonb NULL,
  bank_details_update_requested boolean NOT NULL DEFAULT false,
  bank_details_last_updated_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS helpdesk_tickets (
  ticket_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  category varchar(20) NOT NULL CHECK (category IN ('FINANCE', 'ACADEMICS', 'IT', 'HOSTEL')),
  subject varchar(200) NOT NULL,
  description text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'RESOLVED')),
  assigned_to_user_id uuid NULL REFERENCES users(user_id) ON DELETE SET NULL,
  conversation jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_helpdesk_tickets_student ON helpdesk_tickets (student_user_id);
CREATE INDEX IF NOT EXISTS idx_helpdesk_tickets_assigned_to ON helpdesk_tickets (assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_helpdesk_tickets_category_status ON helpdesk_tickets (category, status);

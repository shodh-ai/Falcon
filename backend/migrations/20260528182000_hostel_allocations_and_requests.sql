CREATE TABLE IF NOT EXISTS hostel_allocations (
  allocation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id uuid NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  room_id int NOT NULL REFERENCES operations_hostel_rooms(room_id) ON DELETE RESTRICT,
  bed_number varchar(20) NULL,
  mess_plan varchar(40) NOT NULL,
  start_date date NOT NULL,
  end_date date NULL,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VACATED')),
  warden_user_id uuid NULL REFERENCES users(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hostel_allocations_room ON hostel_allocations (room_id);
CREATE INDEX IF NOT EXISTS idx_hostel_allocations_status ON hostel_allocations (status);

CREATE TABLE IF NOT EXISTS hostel_requests (
  request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  request_type varchar(20) NOT NULL CHECK (request_type IN ('GATE_PASS', 'ROOM_CHANGE', 'MESS_CHANGE', 'MAINTENANCE')),
  payload jsonb NULL,
  remarks text NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  warden_user_id uuid NULL REFERENCES users(user_id) ON DELETE SET NULL,
  approved_at timestamptz NULL,
  rejected_at timestamptz NULL,
  qr_token varchar(80) NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hostel_requests_student ON hostel_requests (student_user_id);
CREATE INDEX IF NOT EXISTS idx_hostel_requests_type_status ON hostel_requests (request_type, status);

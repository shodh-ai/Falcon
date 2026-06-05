-- Minimal fix: tables required for /api/operations/hostel/leaves (idempotent)

CREATE TABLE IF NOT EXISTS operations_hostels (
  hostel_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  hostel_code VARCHAR(50) NOT NULL,
  hostel_name VARCHAR(120) NOT NULL,
  hostel_type VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  contact_number VARCHAR(20),
  address TEXT,
  facilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  check_in_time TIME,
  check_out_time TIME,
  curfew_time TIME,
  visiting_hours VARCHAR(100),
  laundry_days VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, hostel_code)
);

ALTER TABLE operations_hostel_rooms
  ADD COLUMN IF NOT EXISTS hostel_id UUID REFERENCES operations_hostels(hostel_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS floor VARCHAR(20),
  ADD COLUMN IF NOT EXISTS room_type VARCHAR(50);

CREATE TABLE IF NOT EXISTS operations_hostel_leaves (
  leave_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  hostel_id UUID REFERENCES operations_hostels(hostel_id) ON DELETE SET NULL,
  leave_type VARCHAR(40) NOT NULL,
  purpose TEXT,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  approved_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_hostel_leaves_student ON operations_hostel_leaves(student_user_id);
CREATE INDEX IF NOT EXISTS idx_ops_hostel_leaves_status ON operations_hostel_leaves(status);

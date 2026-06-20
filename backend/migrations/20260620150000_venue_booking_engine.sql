-- Generic Venue Booking Engine: student bookable campus spaces + approval ledger

CREATE TABLE IF NOT EXISTS campus_venues (
  venue_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  capacity INT NOT NULL,
  amenities JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_bookable_by_students BOOLEAN NOT NULL DEFAULT true,
  approver_role VARCHAR(50) NOT NULL,
  max_duration_mins INT NOT NULL DEFAULT 120,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campus_venues_tenant_bookable
  ON campus_venues(tenant_id, is_bookable_by_students);

CREATE TABLE IF NOT EXISTS venue_bookings (
  booking_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES campus_venues(venue_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  purpose TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING_APPROVAL',
  approved_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  approver_remarks TEXT,
  qr_token VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT venue_bookings_time_order CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_venue_booking_times
  ON venue_bookings(venue_id, start_time, end_time)
  WHERE status IN ('APPROVED', 'PENDING_APPROVAL');

CREATE INDEX IF NOT EXISTS idx_venue_bookings_student_active
  ON venue_bookings(student_user_id, status)
  WHERE status IN ('APPROVED', 'PENDING_APPROVAL');

CREATE INDEX IF NOT EXISTS idx_venue_bookings_tenant_status
  ON venue_bookings(tenant_id, status, start_time);

-- Demo bookable venues (SGVU tenant)
INSERT INTO campus_venues (tenant_id, name, capacity, amenities, is_bookable_by_students, approver_role, max_duration_mins)
SELECT t.tenant_id, v.name, v.capacity, v.amenities::jsonb, true, v.approver_role, v.max_mins
FROM tenants t
CROSS JOIN (VALUES
  ('Library GD Room 1', 8, '["Whiteboard", "Quiet Zone"]', 'LIBRARIAN', 120),
  ('Library GD Room 2', 6, '["Whiteboard", "Quiet Zone"]', 'LIBRARIAN', 120),
  ('Block B Seminar Hall', 60, '["Projector Available", "Smart TV", "Whiteboard"]', 'HOD_MECH', 180),
  ('Block C Classroom 201', 40, '["Whiteboard", "Quiet Zone"]', 'HOD_CSE', 120),
  ('Central Seminar Hall', 120, '["Projector Available", "Smart TV", "PA System"]', 'ESTATE_OFFICER', 240)
) AS v(name, capacity, amenities, approver_role, max_mins)
WHERE t.subdomain = 'sgvu'
  AND NOT EXISTS (
    SELECT 1 FROM campus_venues cv
    WHERE cv.tenant_id = t.tenant_id AND cv.name = v.name
  );

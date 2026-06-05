-- Falcon Events & Chapters Hub

CREATE TABLE IF NOT EXISTS campus_clubs (
  club_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  faculty_advisor_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  student_coordinator_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campus_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  club_id UUID REFERENCES campus_clubs(club_id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  venue VARCHAR(255),
  event_date TIMESTAMPTZ NOT NULL,
  total_slots INT NOT NULL,
  available_slots INT NOT NULL,
  pending_holds INT NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  ticket_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING_APPROVAL',
  rejection_comment TEXT,
  approved_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_registrations (
  registration_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES campus_events(event_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'FREE',
  payment_status VARCHAR(50) NOT NULL DEFAULT 'FREE',
  transaction_id VARCHAR(100),
  gateway_order_id VARCHAR(120),
  qr_code VARCHAR(80) UNIQUE,
  hold_expires_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, student_user_id)
);

CREATE INDEX IF NOT EXISTS idx_campus_events_tenant_status ON campus_events(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_campus_events_date ON campus_events(event_date);
CREATE INDEX IF NOT EXISTS idx_event_registrations_event ON event_registrations(event_id, status);
CREATE INDEX IF NOT EXISTS idx_event_registrations_student ON event_registrations(student_user_id);

-- Demo seed (SGVU)
INSERT INTO campus_clubs (tenant_id, name, description, faculty_advisor_id, student_coordinator_id)
SELECT t.tenant_id, 'Robotics Club', 'Build, code, and compete in national robotics meets.',
  fa.user_id, sc.user_id
FROM tenants t
LEFT JOIN users fa ON lower(fa.official_email) = 'faculty1@mygyanvihar.com' AND fa.tenant_id = t.tenant_id
LEFT JOIN users sc ON lower(sc.official_email) = 'student1@mygyanvihar.com' AND sc.tenant_id = t.tenant_id
WHERE t.subdomain = 'sgvu'
  AND NOT EXISTS (SELECT 1 FROM campus_clubs cc WHERE cc.tenant_id = t.tenant_id AND cc.name = 'Robotics Club');

INSERT INTO campus_clubs (tenant_id, name, description)
SELECT t.tenant_id, 'Cultural Committee', 'Music, dance, and campus cultural festivals.'
FROM tenants t
WHERE t.subdomain = 'sgvu'
  AND NOT EXISTS (SELECT 1 FROM campus_clubs cc WHERE cc.tenant_id = t.tenant_id AND cc.name = 'Cultural Committee');

INSERT INTO campus_events (
  tenant_id, club_id, title, description, venue, event_date,
  total_slots, available_slots, is_paid, ticket_price, status, approved_at
)
SELECT
  t.tenant_id,
  c.club_id,
  e.title,
  e.description,
  e.venue,
  e.event_date::timestamptz,
  e.total_slots,
  e.total_slots,
  e.is_paid,
  e.price,
  'APPROVED',
  NOW()
FROM tenants t
JOIN campus_clubs c ON c.tenant_id = t.tenant_id AND c.name = 'Robotics Club'
CROSS JOIN (VALUES
  (
    'Intro to ROS Workshop',
    'Hands-on robotics workshop for beginners.',
    'Innovation Lab',
    (CURRENT_DATE + INTERVAL '14 days')::timestamp + TIME '10:00',
    50,
    false,
    0
  ),
  (
    'Falcon DJ Night',
    'Annual campus DJ night — limited passes.',
    'Open Air Theatre',
    (CURRENT_DATE + INTERVAL '21 days')::timestamp + TIME '19:00',
    100,
    true,
    500
  )
) AS e(title, description, venue, event_date, total_slots, is_paid, price)
WHERE t.subdomain = 'sgvu'
  AND NOT EXISTS (SELECT 1 FROM campus_events ce WHERE ce.tenant_id = t.tenant_id LIMIT 1);

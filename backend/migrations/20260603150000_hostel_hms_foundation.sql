-- Hostel Management System foundation (legacy HMS parity)

CREATE TABLE IF NOT EXISTS operations_hostel_rooms (
  room_id SERIAL PRIMARY KEY,
  hostel_block VARCHAR(40) NOT NULL,
  room_number VARCHAR(20) NOT NULL,
  capacity INT NOT NULL DEFAULT 2,
  occupied INT NOT NULL DEFAULT 0,
  gender VARCHAR(20) NOT NULL DEFAULT 'BOYS',
  status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
  warden_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hostel_block, room_number)
);

CREATE TABLE IF NOT EXISTS operations_gate_passes (
  pass_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  expected_exit_at TIMESTAMPTZ NOT NULL,
  expected_return_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  qr_token VARCHAR(80) NULL,
  approved_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  exited_at TIMESTAMPTZ NULL,
  returned_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS operations_hostel_beds (
  bed_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id INT NOT NULL REFERENCES operations_hostel_rooms(room_id) ON DELETE CASCADE,
  bed_label VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, bed_label)
);

CREATE TABLE IF NOT EXISTS operations_hostel_fines (
  fine_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  hostel_id UUID REFERENCES operations_hostels(hostel_id) ON DELETE SET NULL,
  item_description VARCHAR(255) NOT NULL,
  damage_severity VARCHAR(20),
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  finance_demand_id UUID NULL,
  reported_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operations_mess_menus (
  menu_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  meal_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  special_notes TEXT,
  alternative_options TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operations_hostel_warden_assignments (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  hostel_id UUID NOT NULL REFERENCES operations_hostels(hostel_id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, hostel_id)
);

CREATE TABLE IF NOT EXISTS operations_hostel_roll_call (
  record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostel_id UUID NOT NULL REFERENCES operations_hostels(hostel_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  roll_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  marked_by_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  notes TEXT,
  UNIQUE (hostel_id, student_user_id, roll_date)
);

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

CREATE TABLE IF NOT EXISTS operations_hostel_visitors (
  visitor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostel_id UUID NOT NULL REFERENCES operations_hostels(hostel_id) ON DELETE CASCADE,
  pass_id VARCHAR(40) NOT NULL UNIQUE,
  visitor_name VARCHAR(120) NOT NULL,
  student_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  relation VARCHAR(60),
  purpose TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'INSIDE',
  entry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exit_at TIMESTAMPTZ NULL,
  processed_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS operations_hostel_master_data (
  config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  category VARCHAR(40) NOT NULL,
  label VARCHAR(120) NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tenant_id, category, label)
);

CREATE TABLE IF NOT EXISTS operations_hostel_role_permissions (
  permission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  role_name VARCHAR(40) NOT NULL,
  permission_key VARCHAR(80) NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tenant_id, role_name, permission_key)
);

CREATE TABLE IF NOT EXISTS operations_hostel_broadcasts (
  broadcast_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  hostel_ids UUID[] NOT NULL DEFAULT '{}',
  send_email BOOLEAN NOT NULL DEFAULT false,
  send_sms BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE operations_gate_passes
  ADD COLUMN IF NOT EXISTS hostel_id UUID REFERENCES operations_hostels(hostel_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pass_no VARCHAR(30),
  ADD COLUMN IF NOT EXISTS purpose VARCHAR(120);

ALTER TABLE hostel_allocations
  ADD COLUMN IF NOT EXISTS ops_bed_id UUID REFERENCES operations_hostel_beds(bed_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ops_hostel_rooms_hostel ON operations_hostel_rooms(hostel_id);
CREATE INDEX IF NOT EXISTS idx_ops_hostel_beds_room ON operations_hostel_beds(room_id);
CREATE INDEX IF NOT EXISTS idx_ops_hostel_fines_student ON operations_hostel_fines(student_user_id);
CREATE INDEX IF NOT EXISTS idx_ops_hostel_roll_date ON operations_hostel_roll_call(roll_date, hostel_id);
CREATE INDEX IF NOT EXISTS idx_ops_hostel_leaves_status ON operations_hostel_leaves(status);
CREATE INDEX IF NOT EXISTS idx_ops_hostel_visitors_pass ON operations_hostel_visitors(pass_id);

-- Seed hostels for SGVU tenant
INSERT INTO operations_hostels (
  tenant_id, hostel_code, hostel_name, hostel_type, contact_number, address,
  facilities, check_in_time, check_out_time, curfew_time, visiting_hours, laundry_days
)
SELECT
  t.tenant_id,
  v.code,
  v.name,
  v.htype,
  v.phone,
  v.addr,
  v.fac::jsonb,
  '10:00'::time,
  '08:00'::time,
  '22:00'::time,
  '10:00 AM – 6:00 PM',
  'Mon, Wed, Fri'
FROM tenants t
CROSS JOIN (VALUES
  ('ASHFAQULLA', 'Ashfaquilla Hostel', 'Boys', '9876543210', 'North Campus Block A',
   '["Wi-Fi","Laundry","Gym","Study Room"]'),
  ('BIRSA_MUNDA', 'Birsa Munda Hostel', 'Boys', '9876543211', 'East Campus',
   '["Wi-Fi","Laundry","Mess","Recreation"]'),
  ('SURYA_SEN', 'Surya Sen Hostel', 'Girls', '9876543212', 'West Campus',
   '["Wi-Fi","Laundry","Security Desk","Medical Room"]')
) AS v(code, name, htype, phone, addr, fac)
WHERE t.subdomain = 'sgvu'
ON CONFLICT (tenant_id, hostel_code) DO NOTHING;

-- Link existing rooms to hostels by block name
UPDATE operations_hostel_rooms r
SET hostel_id = h.hostel_id
FROM operations_hostels h
WHERE r.hostel_id IS NULL
  AND (
    upper(replace(r.hostel_block, ' ', '_')) = h.hostel_code
    OR upper(r.hostel_block) LIKE '%' || split_part(h.hostel_code, '_', 1) || '%'
    OR (h.hostel_code = 'BIRSA_MUNDA' AND upper(r.hostel_block) LIKE '%BIRSA%')
  );

UPDATE operations_hostel_rooms r
SET hostel_id = (SELECT hostel_id FROM operations_hostels WHERE hostel_code = 'BIRSA_MUNDA' LIMIT 1)
WHERE r.hostel_id IS NULL;

-- Seed ops beds from capacity
INSERT INTO operations_hostel_beds (room_id, bed_label, status)
SELECT r.room_id, 'Bed ' || gs.n,
  CASE WHEN gs.n <= r.occupied THEN 'OCCUPIED' ELSE 'AVAILABLE' END
FROM operations_hostel_rooms r
CROSS JOIN generate_series(1, GREATEST(r.capacity, 1)) AS gs(n)
ON CONFLICT (room_id, bed_label) DO NOTHING;

-- Warden assignment for demo warden
INSERT INTO operations_hostel_warden_assignments (user_id, hostel_id)
SELECT u.user_id, h.hostel_id
FROM users u
JOIN operations_hostels h ON h.hostel_code = 'SURYA_SEN'
WHERE lower(u.official_email) IN ('warden@mygyanvihar.com', 'dev.warden@mygyanvihar.com')
ON CONFLICT DO NOTHING;

UPDATE operations_hostel_rooms
SET warden_user_id = (
  SELECT u.user_id FROM users u
  WHERE lower(u.official_email) IN ('warden@mygyanvihar.com', 'dev.warden@mygyanvihar.com')
  LIMIT 1
),
floor = COALESCE(floor, '2nd Floor'),
room_type = COALESCE(room_type, 'Two Seater NON AC')
WHERE hostel_id = (SELECT hostel_id FROM operations_hostels WHERE hostel_code = 'SURYA_SEN' LIMIT 1);

-- Master data defaults
INSERT INTO operations_hostel_master_data (tenant_id, category, label, meta)
SELECT t.tenant_id, c.cat, c.lbl, c.meta::jsonb
FROM tenants t
CROSS JOIN (VALUES
  ('ROOM_TYPE', 'Two Seater NON AC', '{"ac":false,"capacity":2}'),
  ('ROOM_TYPE', 'Two Seater AC', '{"ac":true,"capacity":2}'),
  ('TICKET_TYPE', 'Room Issue', '{"priority":"HIGH"}'),
  ('TICKET_TYPE', 'Cleaning Request', '{"priority":"LOW"}'),
  ('TICKET_TYPE', 'Electrical', '{"priority":"HIGH"}'),
  ('LEAVE_TYPE', 'Home Visit', '{}'),
  ('LEAVE_TYPE', 'Hospital Visit', '{}'),
  ('LEAVE_TYPE', 'Market Visit', '{}')
) AS c(cat, lbl, meta)
WHERE t.subdomain = 'sgvu'
ON CONFLICT (tenant_id, category, label) DO NOTHING;

INSERT INTO operations_hostel_role_permissions (tenant_id, role_name, permission_key, allowed)
SELECT t.tenant_id, p.role, p.key, p.ok
FROM tenants t
CROSS JOIN (VALUES
  ('Warden', 'dashboard', true),
  ('Warden', 'students', true),
  ('Warden', 'student_add', true),
  ('Warden', 'leave_approval', true),
  ('Warden', 'attendance', true),
  ('Warden', 'tickets', true),
  ('Warden', 'fines', true),
  ('Housekeeping', 'dashboard', true),
  ('Housekeeping', 'tickets_view', true)
) AS p(role, key, ok)
WHERE t.subdomain = 'sgvu'
ON CONFLICT (tenant_id, role_name, permission_key) DO NOTHING;

-- Sample weekly mess menu
INSERT INTO operations_mess_menus (tenant_id, week_start_date, week_end_date, meal_plan, alternative_options)
SELECT t.tenant_id,
  date_trunc('week', CURRENT_DATE)::date,
  (date_trunc('week', CURRENT_DATE) + interval '6 days')::date,
  '{"monday":{"breakfast":"Poha & Tea","lunch":"Dal Rice","snacks":"Samosa","dinner":"Roti Sabzi"},"tuesday":{"breakfast":"Idli Sambar","lunch":"Rajma Rice","snacks":"Biscuits","dinner":"Khichdi"}}'::jsonb,
  'Bread Pakoda / Fried Idli / Fruit Bowl'
FROM tenants t
WHERE t.subdomain = 'sgvu'
  AND NOT EXISTS (SELECT 1 FROM operations_mess_menus LIMIT 1);

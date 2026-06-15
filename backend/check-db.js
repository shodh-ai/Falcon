const { Client } = require('pg');
const client = new Client({ user: 'postgres', password: 'postgres', host: 'localhost', port: 5432, database: 'university_governance' });
client.connect().then(() => {
  const seedQuery = `
    DO $$
    DECLARE
      tenant_uuid UUID := 'a0000000-0000-4000-8000-000000000001';
      warden_uuid UUID;
      student_uuid UUID;
      hostel_uuid UUID;
      room_id_val INT;
      bed_id_val UUID;
    BEGIN
      -- Fix schema damage caused by TypeORM DB_SYNCHRONIZE=true
      ALTER TABLE operations_hostel_rooms
        ADD COLUMN IF NOT EXISTS hostel_id UUID REFERENCES operations_hostels(hostel_id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS floor VARCHAR(20),
        ADD COLUMN IF NOT EXISTS room_type VARCHAR(50);
        
      ALTER TABLE operations_gate_passes
        ADD COLUMN IF NOT EXISTS hostel_id UUID REFERENCES operations_hostels(hostel_id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS pass_no VARCHAR(30),
        ADD COLUMN IF NOT EXISTS purpose VARCHAR(120);
        
      ALTER TABLE hostel_allocations
        ADD COLUMN IF NOT EXISTS ops_bed_id UUID REFERENCES operations_hostel_beds(bed_id) ON DELETE SET NULL;

      -- 1. Find or create a Warden
      SELECT u.user_id INTO warden_uuid FROM users u JOIN roles r ON r.role_id = u.role_id WHERE r.role_name = 'Warden' LIMIT 1;
      IF warden_uuid IS NULL THEN
        warden_uuid := gen_random_uuid();
        INSERT INTO users (user_id, tenant_id, name, official_email, password_hash, role_id)
        VALUES (warden_uuid, tenant_uuid, 'Smoke Warden', 'warden.smoke@sgvu.edu', 'hash', (SELECT role_id FROM roles WHERE role_name = 'Warden' LIMIT 1));
      END IF;

      -- 2. Find or create a Student
      SELECT u.user_id INTO student_uuid FROM users u JOIN roles r ON r.role_id = u.role_id WHERE r.role_name = 'Student' LIMIT 1;
      IF student_uuid IS NULL THEN
        student_uuid := gen_random_uuid();
        INSERT INTO users (user_id, tenant_id, name, official_email, password_hash, role_id)
        VALUES (student_uuid, tenant_uuid, 'Smoke Student', 'student.smoke@sgvu.edu', 'hash', (SELECT role_id FROM roles WHERE role_name = 'Student' LIMIT 1));
      END IF;

      -- 3. Create Hostel
      hostel_uuid := gen_random_uuid();
      INSERT INTO operations_hostels (hostel_id, tenant_id, hostel_code, hostel_name, hostel_type)
      VALUES (hostel_uuid, tenant_uuid, 'SMOKE-H1', 'Smoke Test Hostel', 'Boys');

      -- 4. Assign Warden
      INSERT INTO operations_hostel_warden_assignments (user_id, hostel_id)
      VALUES (warden_uuid, hostel_uuid) ON CONFLICT DO NOTHING;

      -- 5. Create Room and Bed
      INSERT INTO operations_hostel_rooms (hostel_id, hostel_block, room_number, capacity, occupied, gender, warden_user_id)
      VALUES (hostel_uuid, 'Block Smoke', '101', 2, 1, 'BOYS', warden_uuid) RETURNING room_id INTO room_id_val;

      INSERT INTO operations_hostel_beds (room_id, bed_label, status)
      VALUES (room_id_val, 'Bed A', 'OCCUPIED') RETURNING bed_id INTO bed_id_val;

      -- 6. Allocate Student
      INSERT INTO hostel_allocations (student_user_id, room_id, ops_bed_id, bed_number, mess_plan, status, start_date)
      VALUES (student_uuid, room_id_val, bed_id_val, 'Bed A', 'REGULAR', 'ACTIVE', CURRENT_DATE);

      -- 7. Create Smoke Leave Request
      INSERT INTO operations_hostel_leaves (student_user_id, hostel_id, leave_type, purpose, from_date, to_date, status)
      VALUES (student_uuid, hostel_uuid, 'HOME', 'Family Function', CURRENT_DATE, CURRENT_DATE + interval '3 days', 'PENDING');

      -- 8. Create Gate Pass
      INSERT INTO operations_gate_passes (student_user_id, hostel_id, purpose, reason, expected_exit_at, expected_return_at, status)
      VALUES (student_uuid, hostel_uuid, 'Market', 'Buying groceries', NOW(), NOW() + interval '2 hours', 'PENDING');

      -- 9. Create Helpdesk Ticket
      INSERT INTO helpdesk_tickets (tenant_id, student_user_id, category, subject, description, status)
      VALUES (tenant_uuid, student_uuid, 'HOSTEL', 'Fan is not working', 'The ceiling fan in my room makes a loud noise.', 'PENDING');

    END $$;
  `;
  client.query(seedQuery)
    .then(res => { console.log('Smoke data injected successfully!'); client.end(); })
    .catch(err => { console.error('Error injecting smoke data:', err); client.end(); });
});

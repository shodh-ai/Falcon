const { Client } = require('pg');
const { v4: uuidv4 } = require('uuid');

const tenantId = 'a0000000-0000-4000-8000-000000000001';

async function seed() {
  const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'university_governance',
    password: 'postgres',
    port: 5432,
  });

  await client.connect();
  console.log('Connected to DB');

  try {
    await client.query('BEGIN');

    // 1. Delete existing beds and rooms to start fresh
    await client.query(`DELETE FROM hostel_beds WHERE tenant_id = $1`, [tenantId]);
    
    // Check if hostel exists, if not create one
    let res = await client.query(`SELECT hostel_id FROM operations_hostels LIMIT 1`);
    let hostelId;
    if (res.rows.length === 0) {
      // Assuming hostel_id might be serial or uuid. If it fails, we omit it.
      // Actually operations_hostels hostel_id is uuid? The earlier query failed on operations_hostel_rooms room_id.
      hostelId = uuidv4();
      await client.query(`INSERT INTO operations_hostels (hostel_name, tenant_id) VALUES ('Test Hostel', $1) RETURNING hostel_id`, [tenantId]).then(r => hostelId = r.rows[0].hostel_id).catch(async e => {
        // if it needs uuid
        await client.query(`INSERT INTO operations_hostels (hostel_id, hostel_name, tenant_id) VALUES ($1, 'Test Hostel', $2)`, [hostelId, tenantId]);
      });
    } else {
      hostelId = res.rows[0].hostel_id;
    }

    // Clear old rooms for this block
    await client.query(`DELETE FROM operations_hostel_rooms WHERE hostel_block = 'Block A'`);

    // Ensure active sale exists
    await client.query(`DELETE FROM hostel_tatkal_sales WHERE tenant_id = $1`, [tenantId]);
    await client.query(`INSERT INTO hostel_tatkal_sales (sale_id, tenant_id, title, starts_at, ends_at, is_active) 
                        VALUES ($1, $2, 'Map Test Sale', NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day', true)`, [uuidv4(), tenantId]);

    const floors = ['Ground Floor', '1st Floor', '2nd Floor'];

    for (const floor of floors) {
      for (let i = 1; i <= 10; i++) {
        const roomNumber = `${floor.charAt(0) === 'G' ? 0 : floor.charAt(0)}${i.toString().padStart(2, '0')}`;
        
        // Insert Room (room_id is serial)
        const roomRes = await client.query(`
          INSERT INTO operations_hostel_rooms (hostel_id, hostel_block, floor, room_number, capacity, occupied)
          VALUES ($1, 'Block A', $2, $3, 4, 0)
          RETURNING room_id
        `, [hostelId, floor, roomNumber]);

        const roomId = roomRes.rows[0].room_id;

        // Insert Beds (3 beds per room)
        for (let b = 1; b <= 3; b++) {
          const bedId = uuidv4();
          await client.query(`
            INSERT INTO hostel_beds (bed_id, room_id, bed_number, is_premium, status, tenant_id)
            VALUES ($1, $2, $3, $4, 'AVAILABLE', $5)
          `, [bedId, roomId, `B${b}`, b === 1, tenantId]);
        }
      }
    }

    await client.query('COMMIT');
    console.log('Seeding successful!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding:', err);
  } finally {
    await client.end();
  }
}

seed();

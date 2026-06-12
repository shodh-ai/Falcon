const { Client } = require('pg');

async function seed() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'university_governance',
  });
  
  await client.connect();

  try {
    const hostelId = '4ba1246b-200c-4638-ba45-fc9396c3fa6d';
    await client.query(`UPDATE operations_hostels SET hostel_name = 'Manikarnika Hostel', hostel_type = 'Girls', hostel_code = 'MANIKARNIKA' WHERE hostel_id = $1`, [hostelId]);

    // delete old beds & rooms
    await client.query(`DELETE FROM operations_hostel_rooms WHERE hostel_id = $1`, [hostelId]);
    const tenantId = 'a0000000-0000-4000-8000-000000000001';

    const floors = ['Ground Floor', '1st Floor', '2nd Floor'];

    for (const floor of floors) {
      let floorPrefix = floor === 'Ground Floor' ? 'G' : floor === '1st Floor' ? '1' : '2';
      
      for (let r = 1; r <= 25; r++) {
        const roomNum = `${floorPrefix}${r.toString().padStart(2, '0')}`;
        const cap = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3
        
        const roomRes = await client.query(`
          INSERT INTO operations_hostel_rooms (hostel_id, hostel_block, room_number, floor, capacity, gender, status)
          VALUES ($1, 'MANIKARNIKA', $2, $3, $4, 'GIRLS', 'AVAILABLE')
          RETURNING room_id
        `, [hostelId, roomNum, floor, cap]);

        const roomId = roomRes.rows[0].room_id;

        const isPremium = Math.random() > 0.6; // 40% chance of AC

        for (let b = 1; b <= cap; b++) {
          const statusRandom = Math.random();
          let bStatus = 'AVAILABLE';
          if (statusRandom > 0.8) bStatus = 'BOOKED';
          else if (statusRandom > 0.7) bStatus = 'IN_CART';

          await client.query(`
            INSERT INTO hostel_beds (room_id, tenant_id, bed_number, is_premium, status)
            VALUES ($1, $2, $3, $4, $5)
          `, [roomId, tenantId, `${roomNum}-${String.fromCharCode(64 + b)}`, isPremium, bStatus]);
        }
      }
    }
    console.log("Successfully seeded Manikarnika Hostel with 25 rooms per floor.");
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
seed();

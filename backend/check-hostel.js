const { Client } = require('pg');

async function check() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'university_governance',
  });
  
  await client.connect();
  
  try {
    const hostels = await client.query(`SELECT * FROM operations_hostels`);
    console.log('Hostels:', hostels.rows);

    const rooms = await client.query(`SELECT hostel_id, floor, COUNT(*) as count FROM operations_hostel_rooms GROUP BY hostel_id, floor`);
    console.log('Rooms per floor:', rooms.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

check();

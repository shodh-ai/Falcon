const { Client } = require('pg');

async function check() {
  const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'university_governance',
    password: 'postgres',
    port: 5432,
  });
  await client.connect();
  const rooms = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'operations_hostel_rooms'");
  console.log('rooms', rooms.rows.map(r => r.column_name));
  const beds = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'hostel_beds'");
  console.log('beds', beds.rows.map(r => r.column_name));
  const hostels = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'operations_hostels'");
  console.log('hostels', hostels.rows.map(r => r.column_name));
  await client.end();
}
check();

const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });

async function run() {
  await client.connect();
  try {
    const res = await client.query("SELECT * FROM operations_hostel_rooms LIMIT 5;");
    console.log('Hostel Rooms:', res.rows);

    const res2 = await client.query("SELECT * FROM timetable_room_allocations LIMIT 5;");
    console.log('Timetable Rooms:', res2.rows);
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
run();

const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
client.connect().then(async () => {
  const res = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`);
  console.log(res.rows.map(r => r.table_name).filter(t => t.includes('room') || t.includes('facilit') || t.includes('build')));
  const res2 = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'timetable_room_allocations'`);
  console.log('timetable_room_allocations', res2.rows);
  client.end();
});

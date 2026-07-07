const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
client.connect().then(async () => {
  const res = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%room%'`);
  console.log('Tables matching room:', res.rows);
  const res2 = await client.query(`SELECT DISTINCT room FROM academic_timetables WHERE room IS NOT NULL`);
  console.log('Distinct rooms in timetables:', res2.rows);
  client.end();
});

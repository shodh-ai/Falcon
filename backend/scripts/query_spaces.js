const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
client.connect().then(async () => {
  const res = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%space%'`);
  console.log('Tables matching space:', res.rows);
  const res2 = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'campus_spaces'`);
  console.log('campus_spaces:', res2.rows);
  client.end();
});

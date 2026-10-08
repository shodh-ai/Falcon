const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
client.connect().then(async () => {
  const res = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'academic_courses'`);
  console.table(res.rows);
  client.end();
});

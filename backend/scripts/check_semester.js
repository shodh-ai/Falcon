const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
client.connect().then(async () => {
  const res = await client.query(`SELECT table_name, column_name FROM information_schema.columns WHERE column_name LIKE '%semester%'`);
  console.table(res.rows);
  client.end();
});

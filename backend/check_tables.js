const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_name LIKE '%course%'
  `);
  console.log(res.rows);
  process.exit(0);
}
run();

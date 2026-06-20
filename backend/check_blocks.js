const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });

async function run() {
  await client.connect();
  try {
    const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%room%' OR table_name LIKE '%hall%' OR table_name LIKE '%block%' OR table_name LIKE '%seat%';");
    console.log(res.rows);
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
run();

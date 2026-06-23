const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
async function run() {
  await client.connect();
  const res = await client.query("SELECT name, approver_role FROM campus_venues WHERE venue_id = '27706d63-dc5b-4136-ab54-1d1b9a3ee752'");
  console.log(res.rows);
  process.exit(0);
}
run();

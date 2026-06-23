const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
async function run() {
  await client.connect();
  await client.query("DELETE FROM venue_bookings WHERE purpose = 'test'");
  process.exit(0);
}
run();

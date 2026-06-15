const { Client } = require('pg');

async function check() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'university_governance',
  });
  
  await client.connect();

  try {
    const res = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'operations_hostel_beds'`);
    console.log(res.rows);
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
check();

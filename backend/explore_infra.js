const { Client } = require('pg');
const c = new Client({ user: 'postgres', host: 'localhost', database: 'university_governance', password: 'postgres', port: 5432 });

c.connect().then(async () => {
  const r = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'campus_spaces'`);
  console.log("campus_spaces columns:", r.rows);
  const data = await c.query(`SELECT * FROM campus_spaces LIMIT 5`);
  console.log("campus_spaces data:", data.rows);
  c.end();
});

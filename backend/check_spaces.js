const { Client } = require('pg');
const c = new Client({ user: 'postgres', host: 'localhost', database: 'university_governance', password: 'postgres', port: 5432 });

c.connect().then(async () => {
  const r = await c.query(`SELECT * FROM campus_spaces WHERE space_type = 'CLASSROOM'`);
  console.log(r.rows);
  c.end();
});

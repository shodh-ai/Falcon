const { Client } = require('pg');
const c = new Client({ user: 'postgres', host: 'localhost', database: 'university_governance', password: 'postgres', port: 5432 });

c.connect().then(() => {
  return c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
}).then(r => {
  const tables = r.rows.map(row => row.table_name);
  console.log("All tables:", tables.join(', '));
  c.end();
});

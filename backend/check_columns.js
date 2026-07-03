const { Client } = require('pg');
const c = new Client('postgresql://postgres:postgres@localhost/university_governance');
c.connect().then(() => {
  return c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'project_guide_students'`);
}).then(r => {
  console.table(r.rows);
  c.end();
}).catch(e => {
  console.error(e);
  c.end();
});

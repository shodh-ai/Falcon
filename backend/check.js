const { Client } = require('pg');
const c = new Client('postgresql://postgres:postgres@localhost/university_governance');
c.connect().then(() => {
  return c.query(`SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'project_guide_students'::regclass`);
}).then(r => {
  console.table(r.rows);
  c.end();
}).catch(e => {
  console.error(e);
  c.end();
});

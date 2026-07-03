const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });

pool.query(`
ALTER TABLE weekly_tests ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
`).then(res => {
  console.log('Added is_active column successfully');
  pool.end();
}).catch(console.error);

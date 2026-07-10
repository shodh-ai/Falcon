const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
pool.query(`
  ALTER TABLE academic_assignments 
  ALTER COLUMN start_date TYPE timestamptz USING start_date AT TIME ZONE 'Asia/Kolkata',
  ALTER COLUMN due_date TYPE timestamptz USING due_date AT TIME ZONE 'Asia/Kolkata';
`).then(() => { 
  console.log('Altered table successfully');
  pool.end(); 
}).catch(console.error);

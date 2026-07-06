const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
pool.query(`
  SELECT 
    title, 
    start_date, 
    NOW() as n, 
    start_date <= NOW() as is_less,
    current_setting('TIMEZONE') as tz,
    start_date::text as start_date_text,
    NOW()::text as now_text
  FROM academic_assignments 
  WHERE title = 'qwdefe'
`).then(res => { 
  console.log('Result:', res.rows);
  pool.end(); 
});

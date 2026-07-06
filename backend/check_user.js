const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
pool.query('SELECT user_id, name, email FROM users WHERE name LIKE \'%Hardik%\'').then(res => { 
  console.log('Hardik User:', res.rows);
  pool.end(); 
});

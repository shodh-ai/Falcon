const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
pool.query('SELECT student_user_id, status FROM student_course_enrollments WHERE course_id = $1', ['62f50300-2aff-4a5d-9832-3f040d8dab86']).then(res => { 
  console.log('Enrollments:', res.rows);
  pool.end(); 
});

const { Client } = require('pg');

async function run() {
  const c = new Client({ user: 'postgres', password: 'postgres', database: 'university_governance', host: 'localhost' });
  await c.connect();
  
  const res = await c.query("SELECT user_id FROM users WHERE name = 'Dev Dean'");
  if (res.rows.length === 0) {
    console.log('Dev Dean not found');
    process.exit(1);
  }
  const deanId = res.rows[0].user_id;
  
  // Check if school already exists
  const existingSchool = await c.query("SELECT school_id FROM schools WHERE school_name = 'School of Engineering'");
  let schoolId;
  if (existingSchool.rows.length > 0) {
    schoolId = existingSchool.rows[0].school_id;
    await c.query("UPDATE schools SET dean_user_id = $1 WHERE school_id = $2", [deanId, schoolId]);
    console.log('Updated existing school:', schoolId);
  }
  
  // Link Dept 1 (Computer Science) to the school
  try {
    await c.query(`INSERT INTO iam_programs (program_name, program_code, duration_years, school_id, dept_id) 
                   VALUES ($1, $2, 4, $3, $4)`,
                   ['B.Tech Computer Science', 'BTECH-CS', schoolId, 1]);
    console.log(`Linked CS to school ${schoolId}`);
  } catch(e) {
    console.log('Maybe already linked', e.message);
  }

  // Link Dept 10 (Mechanical Engineering) if it exists
  try {
    await c.query(`INSERT INTO iam_programs (program_name, program_code, duration_years, school_id, dept_id) 
                   VALUES ($1, $2, 4, $3, $4)`,
                   ['B.Tech Mechanical Engineering', 'BTECH-ME', schoolId, 10]);
    console.log(`Linked ME to school ${schoolId}`);
  } catch(e) {
    console.log('Maybe already linked ME', e.message);
  }

  await c.end();
}
run();

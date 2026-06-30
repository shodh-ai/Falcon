const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance',
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create ECE and EE departments
    const resDeptEce = await client.query(`
      INSERT INTO departments (dept_name, description) 
      VALUES ('Electronics & Comm. Engg.', 'ECE Department') RETURNING dept_id
    `);
    const eceId = resDeptEce.rows[0].dept_id;

    const resDeptEe = await client.query(`
      INSERT INTO departments (dept_name, description) 
      VALUES ('Electrical Engineering', 'EE Department') RETURNING dept_id
    `);
    const eeId = resDeptEe.rows[0].dept_id;

    // 2. Link them to the school via iam_programs (using school_id 1)
    await client.query(`
      INSERT INTO iam_programs (program_name, program_code, school_id, dept_id, duration_years)
      VALUES 
      ('B.Tech ECE', 'BTECH-ECE', 1, $1, 4),
      ('B.Tech EE', 'BTECH-EE', 1, $2, 4)
    `, [eceId, eeId]);

    // Get Faculty role ID
    const roleRes = await client.query(`SELECT role_id FROM roles WHERE role_name = 'Faculty'`);
    const facultyRoleId = roleRes.rows[0].role_id;
    
    // Get HOD role ID
    const hodRoleRes = await client.query(`SELECT role_id FROM roles WHERE role_name = 'HOD'`);
    const hodRoleId = hodRoleRes.rows[0].role_id;

    // 3. Insert Faculties (2 for ECE, 2 for EE)
    const eceHodId = uuidv4();
    const eceFacId = uuidv4();
    const eeHodId = uuidv4();
    const eeFacId = uuidv4();
    const tenantId = 'a0000000-0000-4000-8000-000000000001'; // Default tenant

    await client.query(`
      INSERT INTO users (user_id, tenant_id, name, official_email, role_id, dept_id)
      VALUES 
      ($1, $5, 'Dr. Alice ECE', 'alice.ece@mygyanvihar.com', $6, $7),
      ($2, $5, 'Bob ECE (Faculty)', 'bob.ece@mygyanvihar.com', $8, $7),
      ($3, $5, 'Dr. Charlie EE', 'charlie.ee@mygyanvihar.com', $6, $9),
      ($4, $5, 'Dave EE (Faculty)', 'dave.ee@mygyanvihar.com', $8, $9)
    `, [eceHodId, eceFacId, eeHodId, eeFacId, tenantId, hodRoleId, eceId, facultyRoleId, eeId]);

    // 4. Update departments with HODs
    await client.query(`UPDATE departments SET hod_user_id = $1 WHERE dept_id = $2`, [eceHodId, eceId]);
    await client.query(`UPDATE departments SET hod_user_id = $1 WHERE dept_id = $2`, [eeHodId, eeId]);

    // 5. Add some mock timetables to give them hours
    const courseRes = await client.query(`SELECT course_id FROM academic_courses WHERE tenant_id = $1 LIMIT 2`, [tenantId]);
    const mockCourseEce = courseRes.rows[0].course_id;
    const mockCourseEe = courseRes.rows[1].course_id;

    await client.query(`
      INSERT INTO academic_timetables (timetable_id, tenant_id, course_id, faculty_user_id, day_of_week, start_time, end_time)
      VALUES
      (gen_random_uuid(), $5, $1, $6, 1, '09:00', '11:00'),
      (gen_random_uuid(), $5, $2, $7, 2, '10:00', '13:00'),
      (gen_random_uuid(), $5, $3, $8, 3, '09:00', '15:00'),
      (gen_random_uuid(), $5, $4, $9, 4, '11:00', '12:30')
    `, [
      mockCourseEce, mockCourseEce, mockCourseEe, mockCourseEe, // Just reuse as course_ids
      tenantId, eceHodId, eceFacId, eeHodId, eeFacId
    ]);

    await client.query('COMMIT');
    console.log('Successfully seeded ECE and EE departments, faculties, and workload.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding data:', err);
  } finally {
    client.release();
    pool.end();
  }
}

run();

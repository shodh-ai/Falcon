const { Client } = require('pg');

async function seed() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'university_governance',
  });
  
  await client.connect();

  try {
    // 1. Get 10 students to seed data for
    const studentRes = await client.query(`SELECT user_id, tenant_id FROM users WHERE role_id = (SELECT role_id FROM roles WHERE role_name = 'Student' LIMIT 1) LIMIT 10`);
    if (studentRes.rows.length === 0) {
      console.log('No students found');
      return;
    }
    
    for (const row of studentRes.rows) {
      const studentId = row.user_id;
      const tenantId = row.tenant_id;

      // 2. Clear old enrollments for this student
      await client.query(`DELETE FROM student_course_enrollments WHERE student_user_id = $1`, [studentId]);

      // 3. Get some courses to enroll in
      const coursesRes = await client.query(`SELECT course_id FROM academic_courses WHERE tenant_id = $1 LIMIT 10`, [tenantId]);
      const courses = coursesRes.rows;

      if (courses.length < 5) continue;

      // Insert Sem 1 data (Good)
      await client.query(`INSERT INTO student_course_enrollments (student_user_id, course_id, tenant_id, semester, status, grade, grade_points, attendance_percent) VALUES
        ($1, $2, $3, 1, 'COMPLETED', 'A', 9, 70),
        ($1, $4, $3, 1, 'COMPLETED', 'B', 8, 65)`, 
        [studentId, courses[0].course_id, tenantId, courses[1].course_id]
      );

      // Insert Sem 2 data (Better)
      await client.query(`INSERT INTO student_course_enrollments (student_user_id, course_id, tenant_id, semester, status, grade, grade_points, attendance_percent) VALUES
        ($1, $2, $3, 2, 'COMPLETED', 'A', 9.5, 60),
        ($1, $4, $3, 2, 'COMPLETED', 'A', 10, 62)`, 
        [studentId, courses[2].course_id, tenantId, courses[3].course_id]
      );

      // Insert Sem 3 data (Dip + Backlog)
      await client.query(`INSERT INTO student_course_enrollments (student_user_id, course_id, tenant_id, semester, status, grade, grade_points, attendance_percent) VALUES
        ($1, $2, $3, 3, 'COMPLETED', 'C', 6, 40),
        ($1, $4, $3, 3, 'FAILED', 'F', 2, 20)`, 
        [studentId, courses[4].course_id, tenantId, courses[5].course_id]
      );

      // Seed Job Posting and Application
      await client.query(`DELETE FROM placement_job_applications WHERE student_user_id = $1`, [studentId]);
      
      const jobRes = await client.query(`INSERT INTO placement_job_postings (company_name, role_title, status) VALUES ('Google', 'Software Engineer', 'OPEN') RETURNING job_id`);
      const jobId = jobRes.rows[0].job_id;

      await client.query(`INSERT INTO placement_job_applications (job_id, student_user_id, status) VALUES ($1, $2, 'ACCEPTED')`, [jobId, studentId]);

      console.log('Successfully seeded data for student:', studentId);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

seed();

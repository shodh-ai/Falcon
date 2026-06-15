const { DataSource } = require('typeorm');

const dataSource = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:postgres@localhost:5432/university_governance',
});

async function run() {
  await dataSource.initialize();
  
  const users = await dataSource.query("SELECT user_id, tenant_id FROM users WHERE official_email = 'student1@mygyanvihar.com'");
  
  if (users.length === 0) {
    console.log('student1@mygyanvihar.com not found. Skipping.');
    process.exit(0);
  }

  const { user_id, tenant_id } = users[0];

  // Fix fee head to include "Admission"
  await dataSource.query(`
    UPDATE finance_fee_demands
    SET fee_head = 'Admission Fee'
    WHERE student_user_id = $1 AND fee_head = 'Tuition Fee - Sem 1'
  `, [user_id]);

  // Fix '12th Grade Marksheet' to '12th Marksheet'
  await dataSource.query(`
    UPDATE student_certificates
    SET title = '12th Marksheet'
    WHERE student_user_id = $1 AND title = '12th Grade Marksheet'
  `, [user_id]);

  // Remove duplicate Aadhar Card
  // We keep one (the one with the earliest or latest created_at doesn't matter, just delete one)
  await dataSource.query(`
    DELETE FROM student_certificates
    WHERE certificate_id IN (
      SELECT certificate_id FROM student_certificates
      WHERE student_user_id = $1 AND title = 'Aadhar Card'
      OFFSET 1
    )
  `, [user_id]);

  console.log('Fixed data for student1');
  process.exit(0);
}

run().catch(console.error);

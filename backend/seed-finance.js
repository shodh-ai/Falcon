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

  // Insert Demand
  await dataSource.query(`
    INSERT INTO finance_fee_demands (demand_id, tenant_id, student_user_id, academic_year, fee_head, total_amount, due_date, status)
    VALUES (gen_random_uuid(), $1, $2, '2025', 'Tuition Fee - Sem 1', 50000, '2026-07-01', 'PAID')
  `, [tenant_id, user_id]);

  const demands = await dataSource.query("SELECT demand_id FROM finance_fee_demands WHERE student_user_id = $1 LIMIT 1", [user_id]);
  const demand_id = demands[0].demand_id;

  // Insert Transaction
  await dataSource.query(`
    INSERT INTO finance_transactions (transaction_id, tenant_id, demand_id, student_user_id, amount, status, payment_mode)
    VALUES (gen_random_uuid(), $1, $2, $3, 50000, 'SUCCESS', 'ONLINE')
  `, [tenant_id, demand_id, user_id]);

  // Insert Documents (3 out of 6)
  const docs = ['Aadhar Card', '10th Marksheet', 'Admission Form'];
  for (const doc of docs) {
    await dataSource.query(`
      INSERT INTO student_certificates (certificate_id, tenant_id, student_user_id, title, issuer, file_path, verification_status)
      VALUES (gen_random_uuid(), $1, $2, $3, 'Admissions Office', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', 'VERIFIED')
    `, [tenant_id, user_id, doc]);
  }

  console.log('Seeded finance transactions and documents for student1');
  process.exit(0);
}

run().catch(console.error);

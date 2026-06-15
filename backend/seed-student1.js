const { DataSource } = require('typeorm');

const d = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:postgres@localhost:5432/university_governance',
});

d.initialize().then(async () => {
  const tenantId = 'a0000000-0000-4000-8000-000000000001';

  // Find Student One
  const students = await d.query(`SELECT user_id, name FROM users WHERE official_email = 'student1@mygyanvihar.com' LIMIT 1`);
  if (students.length === 0) {
    console.log('Student One not found.');
    process.exit(0);
  }

  const student = students[0];

  // Insert finance transactions (fee receipts)
  await d.query(
    `INSERT INTO finance_transactions (
      transaction_id, tenant_id, student_user_id, gateway_order_id, gateway_payment_id,
      amount, status, payment_mode, receipt_url, created_at
    ) VALUES (
      gen_random_uuid(), $1, $2, 'order_stu1', 'pay_stu1',
      25000, 'SUCCESS', 'UPI', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', NOW() - interval '2 days'
    )`,
    [tenantId, student.user_id]
  );

  // Insert student certificates (admission documents)
  await d.query(
    `INSERT INTO student_certificates (
      certificate_id, tenant_id, student_user_id, title, issuer, issue_date, file_path,
      verification_status, uploaded_at, updated_at
    ) VALUES (
      gen_random_uuid(), $1, $2, '12th Grade Marksheet', 'CBSE', '2025-05-15',
      'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      'VERIFIED', NOW() - interval '10 days', NOW() - interval '10 days'
    ),
    (
      gen_random_uuid(), $1, $2, 'Aadhar Card', 'UIDAI', null,
      'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      'VERIFIED', NOW() - interval '11 days', NOW() - interval '11 days'
    )`,
    [tenantId, student.user_id]
  );

  console.log('Successfully seeded data for Student One.');
  process.exit(0);
}).catch(console.error);

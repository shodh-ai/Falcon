const { DataSource } = require('typeorm');
const path = require('path');
const d = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:postgres@localhost:5432/university_governance',
  entities: [path.join(__dirname, 'dist/**/*.entity.js')]
});

d.initialize().then(async () => {
  const runner = d.createQueryRunner();
  const tenantId = 'a0000000-0000-4000-8000-000000000001';

  // Find any existing student to link
  const students = await runner.query(`SELECT official_email FROM users WHERE official_email LIKE '%student%' OR official_email LIKE '%test%' LIMIT 1`);
  let email = students.length > 0 ? students[0].official_email : 'admissions.test@mygyanvihar.com';

  if (students.length === 0) {
    // Insert a dummy student if none found
    await runner.query(`
      INSERT INTO users (user_id, official_email, password_hash, primary_role, roles, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, 'hash', 'Student', '["Student"]', NOW(), NOW())
    `, [email]);
  }

  // Clear existing leads for the demo
  await runner.query(`DELETE FROM admissions_leads`);

  // Insert some dummy leads across different stages
  await runner.query(`
    INSERT INTO admissions_leads (lead_id, full_name, email, phone, stage, source, tenant_id, lead_score, created_at, updated_at) VALUES 
    (gen_random_uuid(), 'John Doe', 'john.doe@example.com', '+1234567890', 'RAW_LEAD', 'Website', $1, 10, NOW(), NOW()),
    (gen_random_uuid(), 'Jane Smith', 'jane.smith@example.com', '+0987654321', 'CONTACTED', 'Referral', $1, 20, NOW(), NOW()),
    (gen_random_uuid(), 'Alice Johnson', 'alice.j@example.com', '+1122334455', 'APPLICATION_STARTED', 'Event', $1, 50, NOW(), NOW()),
    (gen_random_uuid(), 'Bob Brown', 'bob.b@example.com', '+5544332211', 'FEE_PAID', 'Advertisement', $1, 80, NOW(), NOW()),
    (gen_random_uuid(), 'Eve (Enrolled)', $2, '+9998887776', 'ENROLLED', 'Organic', $1, 100, NOW(), NOW())
  `, [tenantId, email]);

  console.log('Seed successful. Added 5 dummy leads. ENROLLED lead is linked to student email: ' + email);
  process.exit(0);
}).catch(console.error);

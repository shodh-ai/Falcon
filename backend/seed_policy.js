const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/university_governance',
});

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS university_policies (
        policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        title VARCHAR NOT NULL,
        description TEXT NOT NULL,
        file_url VARCHAR,
        authority_role VARCHAR NOT NULL,
        is_mandatory BOOLEAN DEFAULT false,
        is_voting_enabled BOOLEAN DEFAULT false,
        status VARCHAR DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS student_policy_acknowledgements (
        ack_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        student_user_id UUID NOT NULL,
        policy_id UUID NOT NULL,
        vote VARCHAR,
        acknowledged_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(tenant_id, student_user_id, policy_id)
      );
    `);

    await pool.query(`
      INSERT INTO university_policies (policy_id, tenant_id, title, description, authority_role, is_mandatory, is_voting_enabled, status)
      VALUES (
        '11111111-1111-4111-a111-111111111111', 
        'a0000000-0000-4000-8000-000000000001', 
        'Hostel Curfew Policy 2026', 
        'All students must return to the hostel by 10 PM. This is non-negotiable.', 
        'Chief Warden', 
        true, 
        true, 
        'ACTIVE'
      ) ON CONFLICT DO NOTHING
    `);
    console.log('Seeded successfully');
  } catch (err) {
    console.error('Error seeding:', err);
  } finally {
    process.exit(0);
  }
}

run();

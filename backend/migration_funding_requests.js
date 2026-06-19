const { Client } = require('pg');

const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'university_governance',
  password: 'postgres',
  port: 5432,
});

async function run() {
  await client.connect();

  console.log('Applying DB schema changes for project funding...');

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS project_funding_requests (
        request_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL,
        guide_id UUID NOT NULL REFERENCES faculty_project_guides(guide_id) ON DELETE CASCADE,
        requested_by UUID NOT NULL REFERENCES users(user_id),
        amount NUMERIC NOT NULL,
        purpose VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING_HOD',
        hod_user_id UUID REFERENCES users(user_id),
        hod_commit_message TEXT,
        accountant_user_id UUID REFERENCES users(user_id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('Created project_funding_requests table');
  } catch (e) {
    console.log('Error creating table:', e.message);
  }

  await client.end();
}

run().catch(console.error);

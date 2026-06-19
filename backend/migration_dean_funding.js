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
  console.log('Adding dean columns to project_funding_requests...');

  try {
    await client.query(`
      ALTER TABLE project_funding_requests
      ADD COLUMN IF NOT EXISTS dean_user_id UUID REFERENCES users(user_id),
      ADD COLUMN IF NOT EXISTS dean_commit_message TEXT
    `);
    console.log('Successfully added dean_user_id and dean_commit_message columns');
  } catch (e) {
    console.error('Error adding columns:', e.message);
  }

  await client.end();
}

run();

const { Client } = require('pg');

async function alterTable() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'university_governance',
  });
  
  await client.connect();
  console.log('Connected.');
  
  try {
    await client.query(`
      ALTER TABLE student_profiles 
      ADD COLUMN IF NOT EXISTS profile_photo_url VARCHAR(255),
      ADD COLUMN IF NOT EXISTS bank_details JSONB;
    `);
    console.log('Columns added.');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

alterTable();

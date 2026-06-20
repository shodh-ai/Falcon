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

  console.log('Applying DB schema changes for falcon_notifications...');

  try {
    await client.query(`
      ALTER TABLE falcon_notifications 
      ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'info',
      ADD COLUMN IF NOT EXISTS intent VARCHAR(30) DEFAULT 'info',
      ADD COLUMN IF NOT EXISTS action_label VARCHAR(100),
      ADD COLUMN IF NOT EXISTS metadata JSONB;
    `);

    console.log('Successfully added columns to falcon_notifications.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await client.end();
  }
}

run();

const { Client } = require('pg');

async function fixDb() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'university_governance',
  });

  await client.connect();

  const tables = ['roles', 'departments', 'users', 'user_roles'];
  for (const table of tables) {
    try {
      await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;`);
      console.log(`Added deleted_at to ${table}`);
    } catch (e) {
      console.error(e);
    }
  }

  await client.end();
}

fixDb();

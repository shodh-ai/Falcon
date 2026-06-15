const { DataSource } = require('typeorm');

const dataSource = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:postgres@localhost:5432/university_governance',
});

async function run() {
  await dataSource.initialize();
  const users = await dataSource.query(`SELECT official_email, tenant_id FROM users WHERE official_email IN ('student1@mygyanvihar.com', 'dev.accountant@mygyanvihar.com')`);
  console.log(users);
  process.exit(0);
}

run().catch(console.error);

const { DataSource } = require('typeorm');

const dataSource = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:postgres@localhost:5432/university_governance',
});

async function run() {
  await dataSource.initialize();
  const rows = await dataSource.query(`
    SELECT official_email, role_name 
    FROM users u 
    JOIN roles r ON u.role_id = r.role_id 
    WHERE r.role_name IN ('HOD', 'Accountant', 'Warden')
  `);
  console.log(rows);
  process.exit(0);
}

run().catch(console.error);

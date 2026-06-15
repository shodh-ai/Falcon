const { DataSource } = require('typeorm');

const dataSource = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:postgres@localhost:5432/university_governance',
});

async function run() {
  await dataSource.initialize();
  const warden = await dataSource.query(`SELECT u.user_id, u.official_email, r.role_name FROM users u JOIN roles r ON u.role_id = r.role_id WHERE r.role_name = 'Warden'`);
  console.log("Wardens: ", warden);
  await dataSource.destroy();
}

run();

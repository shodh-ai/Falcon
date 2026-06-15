const { DataSource } = require('typeorm');

const dataSource = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:postgres@localhost:5432/university_governance',
});

async function run() {
  await dataSource.initialize();
  await dataSource.query(`ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS profile_unlocked_until timestamptz`);
  console.log("Added profile_unlocked_until to student_profiles");
  await dataSource.destroy();
}

run();

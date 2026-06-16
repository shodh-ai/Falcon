const { DataSource } = require('typeorm');

const dataSource = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:postgres@localhost:5432/university_governance',
});

async function run() {
  await dataSource.initialize();
  await dataSource.query(`ALTER TABLE academic_courses ADD COLUMN IF NOT EXISTS course_type varchar(20)`);
  console.log("Added course_type to academic_courses");
  await dataSource.destroy();
}

run();

const { DataSource } = require('typeorm');
const dotenv = require('dotenv');

dotenv.config();

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/university_governance',
});

async function main() {
  await dataSource.initialize();
  
  try {
    const marks = await dataSource.query(`SELECT * FROM academic_marks`);
    console.log('All marks:', marks);
  } catch(e) {
    console.error(e);
  }

  await dataSource.destroy();
}

main().catch(console.error);

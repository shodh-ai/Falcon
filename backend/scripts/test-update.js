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
    const res = await dataSource.query(`UPDATE academic_marks SET status = 'PENDING_COE' WHERE status = 'DRAFT' RETURNING mark_id`);
    console.log('Result type:', Array.isArray(res) ? 'array' : typeof res);
    console.log('Result:', res);
  } catch(e) {
    console.error(e);
  }

  await dataSource.destroy();
}

main().catch(console.error);

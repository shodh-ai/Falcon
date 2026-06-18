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
    // First make them DRAFT
    await dataSource.query(`UPDATE academic_marks SET status = 'DRAFT'`);
    // Then UPDATE and RETURNING
    const res = await dataSource.query(`UPDATE academic_marks SET status = 'PENDING_COE' RETURNING mark_id`);
    console.log('Result array length:', res.length);
    console.log('Result is array of arrays?', Array.isArray(res[0]));
    console.log('Result object:', res);
  } catch(e) {
    console.error(e);
  }

  await dataSource.destroy();
}

main().catch(console.error);

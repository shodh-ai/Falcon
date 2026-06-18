const { DataSource } = require('typeorm');
const dotenv = require('dotenv');

dotenv.config();

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/university_governance',
});

async function main() {
  await dataSource.initialize();
  console.log('DB Connected');
  
  try {
    await dataSource.query(`ALTER TABLE academic_marks DROP CONSTRAINT IF EXISTS academic_marks_status_check;`);
    await dataSource.query(`ALTER TABLE academic_marks ADD CONSTRAINT academic_marks_status_check CHECK (status IN ('DRAFT', 'PENDING_COE', 'PUBLISHED'));`);
    console.log('Constraint updated successfully');
  } catch(e) {
    console.error('Failed to update constraint:', e);
  }

  await dataSource.destroy();
}

main().catch(console.error);

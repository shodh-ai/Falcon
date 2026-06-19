const { Client } = require('pg');
const { v4: uuidv4 } = require('uuid');

const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'university_governance',
  password: 'postgres',
  port: 5432,
});

async function run() {
  await client.connect();

  console.log('1. Applying DB schema changes...');
  
  // Drop foreign key constraints or indices on student_user_id if any (might fail if none, so catch error or ignore)
  try {
    await client.query(`ALTER TABLE faculty_project_guides DROP COLUMN student_user_id CASCADE`);
  } catch (e) {
    console.log('student_user_id already dropped or error:', e.message);
  }

  try {
    await client.query(`
      ALTER TABLE faculty_project_guides 
      ADD COLUMN IF NOT EXISTS start_date DATE,
      ADD COLUMN IF NOT EXISTS end_date DATE,
      ADD COLUMN IF NOT EXISTS funding_allocated NUMERIC,
      ADD COLUMN IF NOT EXISTS funding_consumed NUMERIC
    `);
  } catch (e) {
    console.log('Error altering table:', e.message);
  }

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS project_guide_students (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        guide_id UUID NOT NULL REFERENCES faculty_project_guides(guide_id) ON DELETE CASCADE,
        student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        grade VARCHAR(10),
        tenant_id UUID NOT NULL
      )
    `);
  } catch (e) {
    console.log('Error creating project_guide_students:', e.message);
  }

  console.log('2. Seeding Data...');

  // Clear existing guides for clean state
  await client.query(`DELETE FROM faculty_project_guides`);

  const tenantId = 'a0000000-0000-4000-8000-000000000001';
  const facultyId = 'b0000003-0000-4000-8000-000000000003'; // Faculty One
  const student1Id = 'd2a7af50-2b97-442b-b2be-f5e49df70ea9'; // Sachin Y
  const student2Id = 'b0000002-0000-4000-8000-000000000002'; // Student Two
  const student3Id = 'e2e00001-0000-4000-8000-000000000001'; // E2E Student One

  const guide1Id = uuidv4();
  const guide2Id = uuidv4();
  const guide3Id = uuidv4();

  // Active Project (Multiple Students)
  await client.query(
    `INSERT INTO faculty_project_guides (guide_id, tenant_id, faculty_user_id, project_title, program, status, created_at, start_date, funding_allocated, funding_consumed)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), CURRENT_DATE - INTERVAL '30 days', 50000.00, 15000.00)`,
    [guide1Id, tenantId, facultyId, 'AI-driven Microservice Architecture', 'B.Tech CSE', 'ACTIVE']
  );

  // Active Project (Single Student)
  await client.query(
    `INSERT INTO faculty_project_guides (guide_id, tenant_id, faculty_user_id, project_title, program, status, created_at, start_date, funding_allocated, funding_consumed)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), CURRENT_DATE - INTERVAL '10 days', 10000.00, 0)`,
    [guide2Id, tenantId, facultyId, 'Blockchain Supply Chain Tracker', 'B.Tech CSE', 'ACTIVE']
  );

  // Completed Project
  await client.query(
    `INSERT INTO faculty_project_guides (guide_id, tenant_id, faculty_user_id, project_title, program, status, created_at, start_date, end_date, funding_allocated, funding_consumed)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), CURRENT_DATE - INTERVAL '180 days', CURRENT_DATE - INTERVAL '5 days', 25000.00, 24500.00)`,
    [guide3Id, tenantId, facultyId, 'IoT Smart Agriculture System', 'B.Tech ECE', 'COMPLETED']
  );

  // Mapping students to Project 1
  await client.query(`INSERT INTO project_guide_students (guide_id, student_user_id, tenant_id) VALUES ($1, $2, $3)`, [guide1Id, student1Id, tenantId]);
  await client.query(`INSERT INTO project_guide_students (guide_id, student_user_id, tenant_id) VALUES ($1, $2, $3)`, [guide1Id, student2Id, tenantId]);

  // Mapping student to Project 2
  await client.query(`INSERT INTO project_guide_students (guide_id, student_user_id, tenant_id) VALUES ($1, $2, $3)`, [guide2Id, student3Id, tenantId]);

  // Mapping students to Completed Project 3 with grades
  await client.query(`INSERT INTO project_guide_students (guide_id, student_user_id, grade, tenant_id) VALUES ($1, $2, $3, $4)`, [guide3Id, student1Id, 'A+', tenantId]);
  await client.query(`INSERT INTO project_guide_students (guide_id, student_user_id, grade, tenant_id) VALUES ($1, $2, $3, $4)`, [guide3Id, student3Id, 'A', tenantId]);

  console.log('3. Data seeding complete.');
  await client.end();
}

run().catch(console.error);

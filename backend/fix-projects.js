const { Client } = require('pg');

const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'university_governance',
  password: 'postgres',
  port: 5432,
});

async function run() {
  await client.connect();

  console.log('Fixing project count constraint...');
  
  const tenantId = 'a0000000-0000-4000-8000-000000000001';
  const facultyId = 'b0000003-0000-4000-8000-000000000003';

  const res = await client.query(
    `SELECT guide_id FROM faculty_project_guides 
     WHERE faculty_user_id = $1 AND status = 'ACTIVE' 
     ORDER BY created_at DESC`,
    [facultyId]
  );

  console.log(`Found ${res.rows.length} active projects.`);

  if (res.rows.length > 4) {
    const toDelete = res.rows.slice(4).map(r => r.guide_id);
    console.log(`Deleting ${toDelete.length} extra projects to enforce the 4-project constraint.`);
    
    // Convert array to postgres array string format or use ANY()
    for (const id of toDelete) {
       await client.query(`DELETE FROM faculty_project_guides WHERE guide_id = $1`, [id]);
       console.log(`Deleted project ${id}`);
    }
  } else {
    console.log('Constraint is already satisfied (<= 4).');
  }

  await client.end();
}

run().catch(console.error);

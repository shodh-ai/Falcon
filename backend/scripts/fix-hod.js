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
    const tenantId = 'a0000000-0000-4000-8000-000000000001';
    
    // 1. Ensure SGVU_UNIVERSITY exists
    await dataSource.query(`
      INSERT INTO org_entities (tenant_id, entity_code, entity_name)
      VALUES ($1, 'SGVU_UNIVERSITY', 'SGVU University')
      ON CONFLICT DO NOTHING;
    `, [tenantId]);
    
    // 2. Get the entity_id
    const entityRes = await dataSource.query(`SELECT entity_id FROM org_entities WHERE entity_code = 'SGVU_UNIVERSITY' LIMIT 1`);
    const entityId = entityRes[0]?.entity_id;
    console.log('SGVU Entity ID:', entityId);
    
    // 3. Get HOD user_id
    const hodRes = await dataSource.query(`SELECT user_id FROM users WHERE name = 'HOD CSE' LIMIT 1`);
    const hodId = hodRes[0]?.user_id;
    console.log('HOD User ID:', hodId);
    
    if (entityId && hodId) {
      // 4. Grant access
      await dataSource.query(`
        INSERT INTO user_entity_access (user_id, entity_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING;
      `, [hodId, entityId]);
      console.log('Granted entity access to HOD CSE!');
    } else {
      console.log('Could not find HOD or Entity');
    }
  } catch(e) {
    console.error(e);
  }

  await dataSource.destroy();
}

main().catch(console.error);

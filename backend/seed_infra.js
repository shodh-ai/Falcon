const { Client } = require('pg');
const c = new Client({ user: 'postgres', host: 'localhost', database: 'university_governance', password: 'postgres', port: 5432 });

c.connect().then(async () => {
  const t = await c.query(`SELECT tenant_id FROM tenants WHERE subdomain = 'sgvu'`);
  const tenantId = t.rows[0].tenant_id;

  // Clear existing
  await c.query(`DELETE FROM campus_spaces WHERE building_name IN ('Block A', 'Block B') AND space_type = 'CLASSROOM'`);

  const halls = [
    { block: 'Block A', name: 'Hall A1', cap: 30 },
    { block: 'Block A', name: 'Hall A2', cap: 40 },
    { block: 'Block A', name: 'Hall A3', cap: 50 },
    { block: 'Block B', name: 'Hall B1', cap: 60 },
    { block: 'Block B', name: 'Hall B2', cap: 30 },
  ];

  for (const h of halls) {
    await c.query(`INSERT INTO campus_spaces (tenant_id, building_name, room_number, space_type, capacity, status)
      VALUES ($1, $2, $3, 'CLASSROOM', $4, 'AVAILABLE')`, [tenantId, h.block, h.name, h.cap]);
  }
  
  console.log('Smoke data inserted for campus_spaces');
  await c.end();
});

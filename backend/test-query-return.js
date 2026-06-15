const { DataSource } = require('typeorm');

const dataSource = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:postgres@localhost:5432/university_governance',
});

async function run() {
  await dataSource.initialize();
  const res = await dataSource.query(`
    UPDATE campus_events 
    SET pending_holds = pending_holds
    WHERE event_id = '00000000-0000-0000-0000-000000000000'
    RETURNING event_id
  `);
  console.log("UPDATE RETURNING returns:", JSON.stringify(res, null, 2));
  console.log("Is Array?", Array.isArray(res));
  await dataSource.destroy();
}

run();

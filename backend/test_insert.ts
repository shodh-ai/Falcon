import { DataSource } from 'typeorm';

async function test() {
  const ds = new DataSource({
    type: 'postgres',
    url: 'postgresql://postgres:postgres@localhost:5432/university_governance',
  });
  await ds.initialize();
  try {
    const tenantId = 'a0000000-0000-4000-8000-000000000001';
    const clubId = 'e20569a1-550f-4886-ae78-98e3b749de3c'; // Need a valid club ID
    // Let's just grab a valid club
    const club = await ds.query(`SELECT * FROM campus_clubs LIMIT 1`);
    if (!club.length) return console.log('no clubs');
    const cId = club[0].club_id;
    const tId = club[0].tenant_id;

    const result = await ds.query('SELECT * FROM campus_events LIMIT 1');
    if (result.length > 0) {
      console.log(Object.keys(result[0]));
    } else {
      console.log('No rows, trying information_schema');
      const cols = await ds.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'campus_events'`);
      console.log(cols.map((c: any) => c.column_name));
    }
    console.log('Success');
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    await ds.destroy();
  }
}
test();

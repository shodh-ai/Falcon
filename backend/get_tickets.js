const { DataSource } = require('typeorm');
const ds = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'postgres',
  database: 'university_governance'
});

ds.initialize().then(async () => {
  const schemas = await ds.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%'");
  for (const row of schemas) {
    const s = row.schema_name;
    console.log('\nSchema:', s);
    try {
      const res = await ds.query(`SELECT ticket_id, category, status, assigned_to_user_id, student_user_id FROM "${s}".helpdesk_tickets`);
      console.log(res);
    } catch(e) {
      console.log('Skipping due to error', e.message);
    }
  }
  process.exit(0);
}).catch(console.error);

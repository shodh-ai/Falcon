const { DataSource } = require('typeorm');
const path = require('path');

const d = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:postgres@localhost:5432/university_governance',
});

d.initialize().then(async () => {
  const triggers = await d.query(`SELECT trigger_name, action_statement FROM information_schema.triggers WHERE event_object_table = 'admissions_leads'`);
  console.log('Triggers:', triggers);
  process.exit(0);
}).catch(console.error);

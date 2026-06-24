const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
async function run() {
  await client.connect();
  const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
  const tables = res.rows.map(r => r.table_name).filter(n => 
    n.includes('course') || n.includes('mark') || n.includes('grade') || 
    n.includes('eval') || n.includes('test') || n.includes('assess') || n.includes('exam')
  );
  console.log(tables);
  process.exit(0);
}
run();

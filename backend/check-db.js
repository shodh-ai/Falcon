const { DataSource } = require('typeorm');
const d = new DataSource({ type: 'postgres', url: 'postgresql://postgres:postgres@localhost:5432/university_governance' });
d.initialize().then(() => d.query("SELECT lead_id, full_name, stage FROM admissions_leads")).then(console.log).finally(()=>process.exit(0));

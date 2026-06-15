const { DataSource } = require('typeorm');
const path = require('path');
const d = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:postgres@localhost:5432/university_governance',
  entities: [path.join(__dirname, 'dist/**/*.entity.js')]
});

d.initialize().then(async () => {
  const runner = d.createQueryRunner();
  
  const leadsBefore = await runner.query(`SELECT lead_id, full_name, stage FROM admissions_leads`);
  console.log('Leads before:', leadsBefore);

  const rawLead = leadsBefore.find(l => l.stage === 'RAW_LEAD');
  if (rawLead) {
    console.log('Moving lead to CONTACTED...', rawLead.full_name);
    // Mimic updateLeadStage logic
    await runner.query(`UPDATE admissions_leads SET stage = 'CONTACTED' WHERE lead_id = $1`, [rawLead.lead_id]);
    
    // Check if it actually moved
    const leadsAfter = await runner.query(`SELECT lead_id, full_name, stage FROM admissions_leads WHERE lead_id = $1`, [rawLead.lead_id]);
    console.log('Lead after:', leadsAfter[0]);
  }

  process.exit(0);
}).catch(console.error);

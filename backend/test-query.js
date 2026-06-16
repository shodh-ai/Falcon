const { DataSource } = require('typeorm');
const path = require('path');

const d = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:postgres@localhost:5432/university_governance',
  entities: [path.join(__dirname, 'dist/**/*.entity.js')],
  logging: true
});

d.initialize().then(async () => {
  const leadRepo = d.getRepository('Lead');
  const lead = await leadRepo.findOne({ where: { stage: 'APPLICATION_STARTED' } });
  if (lead) {
    console.log('Found lead:', lead.full_name);
    lead.stage = 'FEE_PAID';
    await leadRepo.save(lead);
    
    const dbCheck = await d.query(`SELECT stage FROM admissions_leads WHERE lead_id = $1`, [lead.lead_id]);
    console.log('DB ACTUAL STAGE:', dbCheck[0].stage);
  }
  process.exit(0);
}).catch(console.error);

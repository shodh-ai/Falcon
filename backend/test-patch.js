const http = require('http');
const { DataSource } = require('typeorm');
const path = require('path');

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/auth/dev-login/dev.admissionsofficer@mygyanvihar.com',
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = ''; res.on('data', c => data += c);
  res.on('end', () => {
    const token = data.match(/token=([a-zA-Z0-9_.-]+)/)[1];
    
    http.get('http://localhost:4000/api/admissions-crm/kanban', { headers: { 'Authorization': 'Bearer ' + token } }, r1 => {
      let d1 = ''; r1.on('data', c => d1 += c);
      r1.on('end', async () => {
        const kanban = JSON.parse(d1);
        const alice = kanban.find(c => c.stage === 'RAW_LEAD').leads[0];
        
        const patchData = JSON.stringify({ stage: 'CONTACTED' });
        const patchOptions = {
          hostname: 'localhost', port: 4000, path: `/api/admissions-crm/leads/${alice.lead_id}/stage`, method: 'PATCH',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(patchData) }
        };

        const patchReq = http.request(patchOptions, r2 => {
          let d2 = ''; r2.on('data', c => d2 += c);
          r2.on('end', async () => {
            console.log('Patch response:', d2);
            
            const d = new DataSource({ type: 'postgres', url: 'postgresql://postgres:postgres@localhost:5432/university_governance' });
            await d.initialize();
            const dbCheck = await d.query(`SELECT stage FROM admissions_leads WHERE lead_id = $1`, [alice.lead_id]);
            console.log('DB ACTUAL STAGE:', dbCheck[0].stage);
            process.exit(0);
          });
        });
        patchReq.write(patchData); patchReq.end();
      });
    });
  });
});
req.end();

import * as jwt from 'jsonwebtoken';
import { DataSource } from 'typeorm';

async function testHttp() {
  const ds = new DataSource({
    type: 'postgres',
    url: 'postgresql://postgres:postgres@localhost:5432/university_governance',
  });
  await ds.initialize();
  
  // Find student coordinator
  const [{ club_id, tenant_id, student_coordinator_id }] = await ds.query(
    'SELECT club_id, tenant_id, student_coordinator_id FROM campus_clubs WHERE student_coordinator_id IS NOT NULL LIMIT 1'
  );

  await ds.destroy();

  const token = jwt.sign(
    { user_id: student_coordinator_id, tenant_id: tenant_id, roles: ['Student'] },
    'local-development-secret',
    { expiresIn: '1h' }
  );

  try {
    const res = await fetch('http://localhost:4000/api/campus-events/coordinator/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-tenant-subdomain': 'sgvu'
      },
      body: JSON.stringify({
        club_id: club_id,
        title: 'Test HTTP Proposal',
        description: 'Test description',
        event_date: new Date().toISOString(),
        total_slots: 50,
        is_paid: false,
        ticket_price: 0,
        funds_needed: 1000,
      }),
    });
    
    const body = await res.text();
    console.log('HTTP_STATUS:', res.status);
    console.log('HTTP_BODY:', body);
  } catch (error: any) {
    console.error('HTTP_ERROR:', error);
  }
}

testHttp();

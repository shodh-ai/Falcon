const { Client } = require('pg');
const c = new Client({ user: 'postgres', host: 'localhost', database: 'university_governance', password: 'postgres', port: 5432 });

c.connect().then(async () => {
  try {
    await c.query(`
      CREATE TABLE IF NOT EXISTS invigilation_unavailability_requests (
        request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
        assignment_id UUID NOT NULL REFERENCES faculty_invigilation_assignments(assignment_id) ON DELETE CASCADE,
        faculty_user_id UUID NOT NULL REFERENCES users(user_id),
        reason TEXT NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
        exam_cell_comment TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('Table invigilation_unavailability_requests created successfully.');
  } catch (e) {
    console.error('Error creating table:', e);
  } finally {
    c.end();
  }
});

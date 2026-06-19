const { Client } = require('pg');
const c = new Client({ user: 'postgres', host: 'localhost', database: 'university_governance', password: 'postgres', port: 5432 });

c.connect().then(async () => {
  try {
    await c.query(`
      CREATE TABLE IF NOT EXISTS exam_seating_runs (
        run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
        allocation_strategy VARCHAR(50) NOT NULL,
        exam_type VARCHAR(50),
        exam_schedule_id UUID REFERENCES exam_schedules(exam_schedule_id),
        semester INT,
        branch VARCHAR(100),
        allocations JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('Table exam_seating_runs created successfully.');
  } catch (e) {
    console.error('Error creating table:', e);
  } finally {
    c.end();
  }
});

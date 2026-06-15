const { DataSource } = require('typeorm');

const dataSource = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:postgres@localhost:5432/university_governance',
});

async function run() {
  await dataSource.initialize();
  
  const columns = [
    'sla_deadline timestamptz',
    'escalation_level int DEFAULT 0',
    'resolved_by uuid',
    'resolution_time_hours numeric(5,2)',
    'resolved_at timestamptz'
  ];

  for (const col of columns) {
    try {
      await dataSource.query(`ALTER TABLE helpdesk_tickets ADD COLUMN IF NOT EXISTS ${col}`);
      console.log(`Added ${col}`);
    } catch (e) {
      console.log(`Error adding ${col}:`, e.message);
    }
  }

  await dataSource.destroy();
}

run();

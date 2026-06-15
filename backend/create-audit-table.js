const { DataSource } = require('typeorm');

const d = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:postgres@localhost:5432/university_governance',
});

d.initialize().then(async () => {
  await d.query(`
    CREATE TABLE IF NOT EXISTS system_audit_logs (
      log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      table_name VARCHAR(100) NOT NULL,
      record_id UUID,
      action VARCHAR(20) NOT NULL,
      old_value JSONB,
      new_value JSONB,
      changed_by_user_id UUID,
      changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS IDX_audit_table_record ON system_audit_logs (table_name, record_id);
    CREATE INDEX IF NOT EXISTS IDX_audit_changed_at ON system_audit_logs (changed_at);
  `);
  console.log('system_audit_logs table created successfully.');
  process.exit(0);
}).catch(console.error);

const { Client } = require('pg');

const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'university_governance',
  password: 'postgres',
  port: 5432,
});

async function run() {
  await client.connect();
  try {
    // Drop the old constraint
    await client.query('ALTER TABLE finance_gst_tds_tracking DROP CONSTRAINT IF EXISTS finance_gst_tds_tracking_vendor_id_fkey;');
    // Add the new constraint pointing to fin_vendors
    await client.query('ALTER TABLE finance_gst_tds_tracking ADD CONSTRAINT finance_gst_tds_tracking_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES fin_vendors(vendor_id) ON DELETE SET NULL;');
    console.log('Fixed foreign key constraint!');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

run();

const { Client } = require('pg');
const c = new Client({ user: 'postgres', host: 'localhost', database: 'university_governance', password: 'postgres', port: 5432 });

async function run() {
  await c.connect();

  // Drop the strict FK and make it deferrable so it works inside transactions
  await c.query('ALTER TABLE fin_expenses DROP CONSTRAINT IF EXISTS fin_expenses_invoice_id_fkey');
  console.log('Dropped old FK constraint');

  // Also drop vendor FK if it points to wrong table
  await c.query('ALTER TABLE fin_expenses DROP CONSTRAINT IF EXISTS fin_expenses_vendor_id_fkey');
  
  // Re-add as DEFERRABLE INITIALLY DEFERRED so it checks at commit time
  await c.query('ALTER TABLE fin_expenses ADD CONSTRAINT fin_expenses_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES fin_vendor_invoices(invoice_id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED');
  console.log('Re-added invoice_id FK as DEFERRABLE');

  // Re-add vendor FK pointing to fin_vendors
  await c.query('ALTER TABLE fin_expenses ADD CONSTRAINT fin_expenses_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES fin_vendors(vendor_id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED');
  console.log('Re-added vendor_id FK as DEFERRABLE');

  console.log('Done! All FK constraints are now deferrable.');
  await c.end();
}

run().catch(e => { console.error(e); c.end(); });

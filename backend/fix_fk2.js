const { Client } = require('pg');
const c = new Client({ user: 'postgres', host: 'localhost', database: 'university_governance', password: 'postgres', port: 5432 });

async function run() {
  await c.connect();

  // Check what fin_expenses_invoice_id_fkey references
  const fk = await c.query(`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'fin_expenses_invoice_id_fkey'`);
  console.log('FK constraint:', fk.rows);

  // Check what tables exist for invoices
  const tables = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_name IN ('fin_vendor_invoices', 'finance_vendor_invoices') AND table_schema = 'public'`);
  console.log('Invoice tables:', tables.rows);

  // Fix: drop old FK and add correct one pointing to fin_vendor_invoices
  await c.query('ALTER TABLE fin_expenses DROP CONSTRAINT IF EXISTS fin_expenses_invoice_id_fkey');
  await c.query('ALTER TABLE fin_expenses ADD CONSTRAINT fin_expenses_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES fin_vendor_invoices(invoice_id) ON DELETE SET NULL');
  console.log('Fixed fin_expenses_invoice_id_fkey -> fin_vendor_invoices');

  await c.end();
}

run().catch(e => { console.error(e); c.end(); });

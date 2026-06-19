const fs = require('fs');
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
    const sql = fs.readFileSync('migrations/20260614120000_budget_hierarchy_fpa.sql', 'utf8');
    await client.query(sql);
    console.log('Migration done.');

    await client.query('ALTER TABLE fin_vendor_invoices ADD COLUMN IF NOT EXISTS department_id INT REFERENCES departments(dept_id) ON DELETE SET NULL;');
    console.log('Added department_id to fin_vendor_invoices.');

    const tenantId = 'a0000000-0000-4000-8000-000000000001';

    // Ensure Computer Science exists
    let res = await client.query("SELECT dept_id FROM departments WHERE dept_name = 'Computer Science'");
    let csId = res.rows[0]?.dept_id;
    if (!csId) {
      const insert = await client.query("INSERT INTO departments (dept_name, description) VALUES ('Computer Science', 'CS Dept') RETURNING dept_id");
      csId = insert.rows[0].dept_id;
    }

    // Ensure Mechanical Engineering exists
    res = await client.query("SELECT dept_id FROM departments WHERE dept_name = 'Mechanical Engineering'");
    let meId = res.rows[0]?.dept_id;
    if (!meId) {
      const insert = await client.query("INSERT INTO departments (dept_name, description) VALUES ('Mechanical Engineering', 'ME Dept') RETURNING dept_id");
      meId = insert.rows[0].dept_id;
    }

    // Insert budgets
    await client.query(`
      INSERT INTO fin_dept_budgets (tenant_id, financial_year, department_id, allocated_amount, utilized_amount, encumbered_amount, status)
      VALUES 
        ($1, '2026-27', $2, 5000000, 150000, 50000, 'ACTIVE'),
        ($1, '2026-27', $3, 3000000, 0, 0, 'ACTIVE')
      ON CONFLICT DO NOTHING
    `, [tenantId, csId, meId]);

    console.log('Smoke data inserted successfully!');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

run();

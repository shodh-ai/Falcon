const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });

const query = `
  INSERT INTO staff_payslips 
    (tenant_id, payslip_id, staff_user_id, month, year, gross_pay, net_pay, working_days, lwp_days, file_path, is_published, published_at, generated_at)
  VALUES
    ('a0000000-0000-4000-8000-000000000001', gen_random_uuid(), '04e01627-8fe0-4092-a1af-1f64db7b0e45', 'April', 2026, 120000.00, 105000.00, 22, 0, '/uploads/payslips/dev-dean-apr2026.pdf', true, NOW(), NOW()),
    ('a0000000-0000-4000-8000-000000000001', gen_random_uuid(), '04e01627-8fe0-4092-a1af-1f64db7b0e45', 'May', 2026, 120000.00, 100000.00, 21, 1, '/uploads/payslips/dev-dean-may2026.pdf', true, NOW(), NOW()),
    ('a0000000-0000-4000-8000-000000000001', gen_random_uuid(), '04e01627-8fe0-4092-a1af-1f64db7b0e45', 'June', 2026, 120000.00, 115000.00, 22, 0, '/uploads/payslips/dev-dean-jun2026.pdf', true, NOW(), NOW())
`;

pool.query(query)
  .then(() => { 
    console.log('Mock payslips inserted successfully.');
    pool.end(); 
  })
  .catch(err => {
    console.error('Error inserting payslips:', err);
    pool.end();
  });

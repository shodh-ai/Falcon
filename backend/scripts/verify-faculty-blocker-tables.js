const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5433),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'university_governance',
  });
  await c.connect();
  const { rows } = await c.query(`
    SELECT
      to_regclass('public.invigilation_duty_swaps') AS swaps,
      to_regclass('public.invigilation_duty_swap_audits') AS audits,
      to_regclass('public.assignment_notification_audits') AS asn,
      to_regclass('public.course_announcements') AS ann,
      to_regclass('public.faculty_question_bank') AS qb,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'falcon_notifications' AND column_name = 'read_at'
      ) AS falcon_read_at
  `);
  console.log(JSON.stringify(rows[0], null, 2));
  await c.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

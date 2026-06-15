const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'university_governance',
  });
  await c.connect();
  const holds = await c.query('SELECT COUNT(*)::int AS n FROM hostel_booking_holds');
  const regs = await c.query('SELECT COUNT(*)::int AS n FROM event_registrations');
  const pending = await c.query(
    `SELECT COUNT(*)::int AS n FROM hostel_booking_holds WHERE status = 'PENDING' AND expires_at < NOW()`,
  );
  await c.end();
  console.log({ holds: holds.rows[0].n, regs: regs.rows[0].n, stalePending: pending.rows[0].n });
})();

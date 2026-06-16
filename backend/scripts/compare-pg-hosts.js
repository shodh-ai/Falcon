const { Client } = require('pg');

async function probe(host) {
  const c = new Client({
    host,
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'university_governance',
  });
  try {
    await c.connect();
    const holds = await c.query('SELECT COUNT(*)::int AS n FROM hostel_booking_holds');
    const pending = await c.query(
      `SELECT COUNT(*)::int AS n FROM hostel_booking_holds WHERE status = 'PENDING' AND expires_at < NOW()`,
    );
    const tenants = await c.query('SELECT COUNT(*)::int AS n FROM tenants');
    console.log({ host, holds: holds.rows[0].n, stalePending: pending.rows[0].n, tenants: tenants.rows[0].n });
  } catch (err) {
    console.log({ host, error: err.message });
  } finally {
    try {
      await c.end();
    } catch {
      /* noop */
    }
  }
}

(async () => {
  for (const host of ['localhost', '127.0.0.1', '::1']) {
    await probe(host);
  }
})();

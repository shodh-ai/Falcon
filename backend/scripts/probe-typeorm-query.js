const { DataSource } = require('typeorm');

(async () => {
  const ds = new DataSource({
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: 'postgres',
    database: 'university_governance',
  });
  await ds.initialize();
  const select = await ds.query(
    `SELECT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'hostel_booking_holds') AS exists`,
  );
  const expired = await ds.query(
    `UPDATE hostel_booking_holds SET status = 'EXPIRED'
     WHERE status = 'PENDING' AND expires_at < NOW()
     RETURNING hold_id, bed_id, student_user_id, tenant_id`,
  );
  console.log('select', select);
  console.log('update', {
    type: typeof expired,
    isArray: Array.isArray(expired),
    length: expired?.length,
    raw: expired,
  });
  await ds.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

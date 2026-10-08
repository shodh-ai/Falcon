/** One-off: sync university_assets for completed write-offs */
const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'apple',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'university_governance',
  });
  await client.connect();
  const res = await client.query(
    `UPDATE university_assets a
     SET status = 'WRITTEN_OFF', book_value = 0, updated_at = NOW()
     FROM asset_writeoff_requests w
     WHERE w.asset_id = a.asset_id
       AND w.status = 'WRITTEN_OFF'
       AND a.status <> 'WRITTEN_OFF'`,
  );
  console.log('Backfilled assets:', res.rowCount);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

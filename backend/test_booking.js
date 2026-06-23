const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
async function run() {
  await client.connect();
  try {
    const tenantId = 'a0000000-0000-4000-8000-000000000001';
    const studentUserId = 'b0000002-0000-4000-8000-000000000002'; // some student
    const venueId = '639f7274-1234-4000-8000-000000000004'; // whatever block B is. I can query it first.

    const venueRows = await client.query("SELECT venue_id, max_duration_mins FROM campus_venues WHERE name ILIKE '%Block B Seminar Hall%'");
    if(venueRows.rows.length === 0) throw new Error("Venue not found");
    const vId = venueRows.rows[0].venue_id;

    // Simulate assertNoOverlap
    const startTime = '2026-06-23 16:00:00+05:30';
    const endTime = '2026-06-23 17:00:00+05:30';
    const overlap = await client.query(
      `SELECT booking_id FROM venue_bookings
       WHERE tenant_id = $1 AND venue_id = $2
         AND status IN ('PENDING_APPROVAL', 'APPROVED')
         AND (start_time, end_time) OVERLAPS ($3::timestamptz, $4::timestamptz)`,
      [tenantId, vId, startTime, endTime]
    );
    console.log("overlap:", overlap.rows);

    const inserted = await client.query(
      `INSERT INTO venue_bookings
         (tenant_id, venue_id, student_user_id, start_time, end_time, purpose, status)
       VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, 'PENDING_APPROVAL')
       RETURNING *`,
      [tenantId, vId, studentUserId, startTime, endTime, "test"]
    );
    console.log("inserted:", inserted.rows);
  } catch (e) {
    console.error("ERROR:", e);
  }
  process.exit(0);
}
run();

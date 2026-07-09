const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
client.connect().then(async () => {
  const res = await client.query(`SELECT timetable_id, course_id, day_of_week, start_time, end_time, room, section, faculty_user_id FROM academic_timetables WHERE deleted_at IS NULL LIMIT 20`);
  console.table(res.rows);
  client.end();
});

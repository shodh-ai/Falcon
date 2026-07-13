const { Client } = require('pg');
(async () => {
  const c = new Client({ host: 'localhost', port: 5432, user: 'postgres', password: 'postgres', database: 'university_governance' });
  await c.connect();
  const days = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const { rows } = await c.query(`
    SELECT t.day_of_week, t.start_time, t.end_time, t.room, c.course_code, c.course_name
    FROM academic_timetables t
    JOIN users u ON u.user_id = t.faculty_user_id
    JOIN academic_courses c ON c.course_id = t.course_id
    WHERE lower(u.official_email) = 'naman.raj@mygyanvihar.com' AND t.deleted_at IS NULL
    ORDER BY t.day_of_week, t.start_time
  `);
  console.table(rows.map((r) => ({
    day: days[r.day_of_week],
    time: `${String(r.start_time).slice(0, 5)}-${String(r.end_time).slice(0, 5)}`,
    course: r.course_code,
    room: r.room,
  })));
  await c.end();
})();

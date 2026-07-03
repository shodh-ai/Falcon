const { Client } = require('pg');
const c = new Client('postgresql://postgres:postgres@localhost/university_governance');

async function run() {
  await c.connect();
  try {
    const hodRes = await c.query(`SELECT user_id, dept_id, tenant_id FROM users WHERE lower(official_email) = 'hod@mygyanvihar.com' LIMIT 1`);
    const hod = hodRes.rows[0];

    const timeRes = await c.query(`
      SELECT t.timetable_id, t.course_id, t.faculty_user_id 
      FROM academic_timetables t
      JOIN users u ON u.user_id = t.faculty_user_id
      WHERE u.dept_id = $1 AND u.tenant_id = $2 AND u.user_id != $3
      LIMIT 3
    `, [hod.dept_id, hod.tenant_id, hod.user_id]);

    if (timeRes.rows.length === 0) {
      console.log('No timetables found for CSE faculty.');
      return;
    }
    const slots = timeRes.rows;

    // Pick a proxy faculty who is not the absent faculty
    const facRes = await c.query(`
      SELECT user_id FROM users 
      WHERE dept_id = $1 AND tenant_id = $2 AND user_id != $3 
      AND is_active = true
    `, [hod.dept_id, hod.tenant_id, hod.user_id]);
    const facList = facRes.rows.map(r => r.user_id);

    const inserts = [];
    for (let i = 0; i < slots.length; i++) {
      const absent = slots[i].faculty_user_id;
      const proxy = facList.find(f => f !== absent) || hod.user_id;

      inserts.push(c.query(`
        INSERT INTO academic_proxy_requests (
          tenant_id, timetable_id, absent_faculty_id, proxy_faculty_id, course_id,
          date_of_proxy, reason, status
        ) VALUES ($1, $2, $3, $4, $5, CURRENT_DATE + ${i + 1}, $6, 'PENDING_HOD_APPROVAL')
      `, [
        hod.tenant_id,
        slots[i].timetable_id,
        absent,
        proxy,
        slots[i].course_id,
        `Emergency leave request ${i + 1} - family medical reason`
      ]));
    }
    await Promise.all(inserts);
    console.log('Smoke data inserted successfully!');
  } catch(e) {
    console.error(e);
  } finally {
    await c.end();
  }
}

run();

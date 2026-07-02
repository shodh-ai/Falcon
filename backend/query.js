const { Client } = require('pg');
const client = new Client({ user: 'postgres', password: 'postgres', host: 'localhost', port: 5432, database: 'university_governance' });
client.connect().then(() => client.query("SELECT t.faculty_user_id, t.course_id, c.course_code FROM academic_timetables t JOIN academic_courses c ON t.course_id = c.course_id WHERE c.course_code = 'DA101'").then(res => { console.log(res.rows); client.end(); }).catch(console.error));

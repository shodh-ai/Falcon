const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
client.connect().then(async () => {
  const res1 = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'academic_timetables'`);
  console.log('academic_timetables', res1.rows);
  const res2 = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'academic_course_allocations'`);
  console.log('academic_course_allocations', res2.rows);
  const res3 = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'academic_courses'`);
  console.log('academic_courses', res3.rows);
  const res4 = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'academic_sections'`);
  console.log('academic_sections', res4.rows);
  const res5 = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'course_sections'`);
  console.log('course_sections', res5.rows);
  client.end();
});

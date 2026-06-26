import { DataSource } from 'typeorm';

const ds = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:postgres@localhost:5432/university_governance'
});

ds.initialize()
  .then(() => ds.query(`SELECT certificate_id, file_path, student_user_id, tenant_id FROM student_certificates WHERE title = 'SMOKE: Campus QA Participation'`))
  .then(res => {
    console.log(res);
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });

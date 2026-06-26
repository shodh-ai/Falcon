import { DataSource } from 'typeorm';
const ds = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:postgres@localhost:5432/university_governance'
});
ds.initialize().then(() => 
  ds.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'academic_course_allocations'`)
    .then(console.log)
    .finally(() => ds.destroy())
);

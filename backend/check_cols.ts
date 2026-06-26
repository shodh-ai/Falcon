import { DataSource } from 'typeorm';
const ds = new DataSource({ type: 'postgres', url: 'postgresql://postgres:postgres@localhost:5432/university_governance' });
ds.initialize().then(() => 
  ds.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'student_profiles'`)
).then(res => { console.log(res.map(r => r.column_name)); process.exit(0); });

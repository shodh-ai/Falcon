import { DataSource } from 'typeorm';
const ds = new DataSource({ type: 'postgres', url: 'postgresql://postgres:postgres@localhost:5432/university_governance' });
ds.initialize().then(() => 
  ds.query(`SELECT student_user_id, file_path, uploaded_at FROM student_onboarding_docs WHERE doc_type = 'PHOTO' ORDER BY uploaded_at DESC LIMIT 5`)
).then(res => { console.log(res); process.exit(0); });

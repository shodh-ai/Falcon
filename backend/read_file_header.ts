import { DataSource } from 'typeorm';
import * as fs from 'fs';

const ds = new DataSource({ type: 'postgres', url: 'postgresql://postgres:postgres@localhost:5432/university_governance' });
ds.initialize().then(() => 
  ds.query(`SELECT profile_photo_url FROM student_profiles WHERE user_id = 'f1000002-0000-4000-8000-000000000002'`)
).then(res => { 
  const url = res[0].profile_photo_url;
  console.log('File:', url);
  console.log('Size:', fs.statSync(url).size);
  console.log('Head:', fs.readFileSync(url).slice(0, 20).toString());
  process.exit(0); 
});

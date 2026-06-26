import { DataSource } from 'typeorm';
const ds = new DataSource({ type: 'postgres', url: 'postgresql://postgres:postgres@localhost:5432/university_governance' });
ds.initialize().then(() => 
  ds.query(`SELECT u.official_email, SUBSTRING(sp.profile_photo_url FROM 1 FOR 60) AS p_url, sp.profile_photo_url AS full_url FROM users u LEFT JOIN student_profiles sp ON u.user_id = sp.user_id WHERE u.official_email = 'student4@mygyanvihar.com'`)
).then(res => { console.log("Current photo URL:", res[0].p_url); console.log("Full length:", res[0].full_url?.length); process.exit(0); });

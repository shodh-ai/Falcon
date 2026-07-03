import { DataSource } from 'typeorm';
const ds = new DataSource({ type: 'postgres', url: 'postgresql://postgres:postgres@localhost:5432/university_governance' });
ds.initialize().then(() => 
  ds.query(`SELECT u.official_email, SUBSTRING(sp.profile_photo_url FROM 1 FOR 40) AS p_url FROM users u LEFT JOIN student_profiles sp ON u.user_id = sp.user_id WHERE u.official_email = 'student4@mygyanvihar.com'`)
).then(res => { console.log(res); process.exit(0); });

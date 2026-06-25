import { DataSource } from 'typeorm';
const ds = new DataSource({ type: 'postgres', url: 'postgresql://postgres:postgres@localhost:5432/university_governance' });
ds.initialize().then(async () => {
  const row = await ds.query(`SELECT profile_photo_url FROM student_profiles WHERE profile_photo_url IS NOT NULL LIMIT 1`);
  if (row.length > 0) {
    const photoUrl = row[0].profile_photo_url;
    await ds.query(`UPDATE student_profiles SET profile_photo_url = $1 WHERE user_id IN (SELECT user_id FROM users WHERE official_email = 'student4@mygyanvihar.com')`, [photoUrl]);
    console.log('Successfully copied profile photo to student4!');
  } else {
    console.log('No photos found in database to copy.');
  }
  process.exit(0);
});

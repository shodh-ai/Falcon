/**
 * Seeds a demo profile photo for student1@mygyanvihar.com so Dashboard,
 * Profile, and ID Card share the same image.
 *
 * Usage: node seed-student-photo.js [path-to-jpg]
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { randomUUID } = require('crypto');

async function main() {
  const source =
    process.argv[2] ||
    path.resolve(
      __dirname,
      '../.cursor/projects/c-Users-aksha-Falcon/assets/demo-student-avatar.jpg',
    );
  // Prefer workspace asset path variants
  const candidates = [
    source,
    path.resolve(__dirname, '../assets/demo-student-avatar.jpg'),
    path.resolve(
      process.env.USERPROFILE || '',
      '.cursor/projects/c-Users-aksha-Falcon/assets/demo-student-avatar.jpg',
    ),
  ];
  const photoPath = candidates.find((p) => fs.existsSync(p));
  if (!photoPath) {
    console.error('Photo file not found. Pass a path: node seed-student-photo.js <jpg>');
    process.exit(1);
  }

  require('dotenv').config({ path: path.join(__dirname, '.env') });
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5433),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'falcon',
  });
  await client.connect();

  const { rows } = await client.query(
    `SELECT u.user_id, u.tenant_id, u.name
     FROM users u
     WHERE u.official_email = 'student1@mygyanvihar.com'
     LIMIT 1`,
  );
  if (!rows[0]) {
    console.error('student1@mygyanvihar.com not found');
    process.exit(1);
  }
  const { user_id, tenant_id, name } = rows[0];

  const uploadRoot = process.env.UPLOAD_PATH || './uploads';
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const dir = path.join(process.cwd(), uploadRoot, tenant_id, String(year), month);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${randomUUID()}.jpg`);
  fs.copyFileSync(photoPath, dest);
  const storedPath = dest;

  await client.query(
    `UPDATE student_profiles
     SET profile_photo_url = $1, updated_at = NOW()
     WHERE user_id = $2 AND tenant_id = $3`,
    [storedPath, user_id, tenant_id],
  );

  await client.query(
    `INSERT INTO student_onboarding_docs (tenant_id, student_user_id, doc_type, file_path, status)
     VALUES ($1, $2, 'PHOTO', $3, 'APPROVED')
     ON CONFLICT (student_user_id, doc_type) DO UPDATE SET
       file_path = EXCLUDED.file_path,
       status = 'APPROVED',
       uploaded_at = NOW()`,
    [tenant_id, user_id, storedPath],
  );

  console.log(`Seeded photo for ${name} (${user_id})`);
  console.log(`File: ${storedPath}`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

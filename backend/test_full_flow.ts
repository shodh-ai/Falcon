import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { ExamsService } from './src/modules/exams/exams.service';
import { DataSource } from 'typeorm';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const db = app.get(DataSource);
  
  const rows = await db.query(`SELECT user_id FROM users WHERE official_email = 'student4@mygyanvihar.com'`);
  const studentUserId = rows[0]?.user_id;
  
  // Check what's in DB
  const profileRows = await db.query(`SELECT profile_photo_url FROM student_profiles WHERE user_id = $1`, [studentUserId]);
  const photoUrl = profileRows[0]?.profile_photo_url;
  console.log('Photo URL from DB:', photoUrl);
  
  if (photoUrl && !photoUrl.startsWith('data:')) {
    console.log('File exists:', fs.existsSync(photoUrl));
    if (fs.existsSync(photoUrl)) {
      const buf = fs.readFileSync(photoUrl);
      console.log('File size:', buf.length);
      // Check magic bytes
      const hex = buf.slice(0, 4).toString('hex');
      console.log('Magic bytes (hex):', hex);
      console.log('Is JPEG:', hex.startsWith('ffd8'));
      console.log('Is PNG:', hex === '89504e47');
    }
  }
  
  const examsService = app.get(ExamsService);
  try {
    const pdfBuffer = await examsService.generateAdmitCardOrThrow(studentUserId);
    fs.writeFileSync('test-admit-card.pdf', pdfBuffer);
    console.log('PDF saved! Size:', pdfBuffer.length);
  } catch (err: any) {
    console.error('Error:', err.message);
  }
  
  if (fs.existsSync('admit-card-debug.log')) {
    console.log('\n--- Debug Log ---');
    console.log(fs.readFileSync('admit-card-debug.log', 'utf-8'));
  }
  
  process.exit(0);
}
bootstrap();

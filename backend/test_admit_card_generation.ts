import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { ExamsService } from './src/modules/exams/exams.service';
import { DataSource } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const db = app.get(DataSource);
  
  // get user id
  const rows = await db.query(`SELECT user_id FROM users WHERE official_email = 'student4@mygyanvihar.com'`);
  const studentUserId = rows[0]?.user_id;
  
  if (!studentUserId) {
    console.error('student4 not found');
    process.exit(1);
  }
  
  const examsService = app.get(ExamsService);
  try {
    const pdfBuffer = await examsService.generateAdmitCardOrThrow(studentUserId);
    console.log('PDF generated! Size:', pdfBuffer.length);
  } catch (err: any) {
    console.error('Error generating PDF:', err.message);
  }
  
  const fs = require('fs');
  if (fs.existsSync('admit-card-debug.log')) {
    console.log('Log content:');
    console.log(fs.readFileSync('admit-card-debug.log', 'utf-8'));
  }
  
  process.exit(0);
}
bootstrap();

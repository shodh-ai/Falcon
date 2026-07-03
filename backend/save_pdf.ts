import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { ExamsService } from './src/modules/exams/exams.service';
import { DataSource } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const db = app.get(DataSource);
  
  const rows = await db.query(`SELECT user_id FROM users WHERE official_email = 'student4@mygyanvihar.com'`);
  const studentUserId = rows[0]?.user_id;
  
  const examsService = app.get(ExamsService);
  const pdfBuffer = await examsService.generateAdmitCardOrThrow(studentUserId);
  require('fs').writeFileSync('admit-card.pdf', pdfBuffer);
  console.log('Saved to admit-card.pdf');
  
  process.exit(0);
}
bootstrap();

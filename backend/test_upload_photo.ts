import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { StudentPortalService } from './src/modules/student-portal/student-portal.service';
import { DataSource } from 'typeorm';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const db = app.get(DataSource);
  
  const rows = await db.query(`SELECT user_id, tenant_id FROM users WHERE official_email = 'student4@mygyanvihar.com'`);
  const studentUserId = rows[0]?.user_id;
  const tenantId = rows[0]?.tenant_id;
  
  const portal = app.get(StudentPortalService);
  
  // mock a file
  fs.writeFileSync('test_upload.jpg', 'fake-jpeg-data');
  const file = {
    buffer: fs.readFileSync('test_upload.jpg'),
    originalname: 'test_upload.jpg',
    mimetype: 'image/jpeg',
    size: 15,
  } as Express.Multer.File;

  try {
    const res = await portal.uploadProfilePhoto(tenantId, studentUserId, file);
    console.log('Upload success!', res.profile_photo_url);
  } catch (err: any) {
    console.error('Upload failed!', err.message);
  }
  
  process.exit(0);
}
bootstrap();

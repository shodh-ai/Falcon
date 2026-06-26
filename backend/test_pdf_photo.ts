import { DataSource } from 'typeorm';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';

const ds = new DataSource({ type: 'postgres', url: 'postgresql://postgres:postgres@localhost:5432/university_governance' });
ds.initialize().then(async () => {
  const row = await ds.query(`SELECT sp.profile_photo_url FROM users u LEFT JOIN student_profiles sp ON u.user_id = sp.user_id WHERE u.official_email = 'student4@mygyanvihar.com'`);
  const profile_picture_url = row[0]?.profile_photo_url;
  
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  
  if (profile_picture_url?.startsWith('data:image/')) {
    try {
      const base64Data = profile_picture_url.split(',')[1];
      if (base64Data) {
        const imageBuffer = Buffer.from(base64Data, 'base64');
        let image;
        if (profile_picture_url.includes('image/png')) {
          image = await pdfDoc.embedPng(imageBuffer);
        } else {
          image = await pdfDoc.embedJpg(imageBuffer);
        }
        
        const imgWidth = 80;
        const imgHeight = 100;
        
        page.drawImage(image, {
          x: width - 50 - imgWidth,
          y: height - 50 - imgHeight,
          width: imgWidth,
          height: imgHeight,
        });
        console.log('Image successfully embedded!');
      }
    } catch (err) {
      console.error('Failed to embed profile picture:', err);
    }
  } else {
    console.log('No data:image found', profile_picture_url?.substring(0, 30));
  }
  process.exit(0);
});

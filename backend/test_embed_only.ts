// Minimal test: try to embed the actual JPEG file with pdf-lib directly
import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';

async function test() {
  const filePath = 'D:\\Falcon\\backend\\uploads\\a0000000-0000-4000-8000-000000000001\\2026\\06\\ae7d0391-07f5-472f-817f-f132f3e370a9.jpg';
  const buf = fs.readFileSync(filePath);
  console.log('File size:', buf.length);
  console.log('Magic hex:', buf.slice(0, 8).toString('hex'));

  const pdfDoc = await PDFDocument.create();
  
  try {
    const img = await pdfDoc.embedJpg(buf);
    console.log('embedJpg SUCCESS! Width:', img.width, 'Height:', img.height);
  } catch (e: any) {
    console.error('embedJpg FAILED:', e.message);
    console.error('Full error:', e);
  }
  
  try {
    const img = await pdfDoc.embedPng(buf);
    console.log('embedPng SUCCESS! Width:', img.width, 'Height:', img.height);
  } catch (e: any) {
    console.error('embedPng FAILED:', e.message);
  }
}
test();

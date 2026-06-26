import * as fs from 'fs';
import * as path from 'path';

async function uploadTest() {
  const jwt = require('jsonwebtoken');
  const token = jwt.sign({ 
    sub: 'b0000001-0000-4000-8000-000000000001', 
    tenantId: 'a0000000-0000-4000-8000-000000000001',
    role: 'Faculty' 
  }, 'local-development-secret');

  const pdfPath = path.join(__dirname, 'test.pdf');
  fs.writeFileSync(pdfPath, '%PDF-1.4 dummy');

  const fileData = fs.readFileSync(pdfPath);
  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  
  let body = '';
  body += `--${boundary}\r\n`;
  body += 'Content-Disposition: form-data; name="file"; filename="test.pdf"\r\n';
  body += 'Content-Type: application/pdf\r\n\r\n';
  
  const payload = Buffer.concat([
    Buffer.from(body, 'utf8'),
    fileData,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
  ]);

  try {
    const res = await fetch('http://localhost:4000/uploads/single', {
      method: 'POST',
      body: payload,
      headers: {
        'x-tenant-subdomain': 'sgvu',
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      }
    });
    console.log('Status:', res.status);
    console.log('Body:', await res.text());
  } catch (err) {
    console.error(err);
  }
}

uploadTest();

const fs = require('fs');
const https = require('https');

const filePath = 'banco_salonstudio_2026-08-17_12-00-01.sql';
const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
const fileContent = fs.readFileSync(filePath);

const header = `--${boundary}\r\nContent-Disposition: form-data; name="sqlFile"; filename="banco.sql"\r\nContent-Type: application/sql\r\n\r\n`;
const footer = `\r\n--${boundary}--\r\n`;

const payload = Buffer.concat([
  Buffer.from(header, 'utf8'),
  fileContent,
  Buffer.from(footer, 'utf8')
]);

console.log('Sending 3.95MB upload to https://bdsalonstudio.onrender.com/api/upload...');
const startTime = Date.now();

const req = https.request({
  hostname: 'bdsalonstudio.onrender.com',
  port: 443,
  path: '/api/upload',
  method: 'POST',
  headers: {
    'Content-Type': 'multipart/form-data; boundary=' + boundary,
    'Content-Length': payload.length
  }
}, res => {
  console.log('STATUS:', res.statusCode);
  let resData = '';
  res.on('data', d => resData += d);
  res.on('end', () => console.log('RESPONSE:', resData, '\nDURATION:', Date.now() - startTime, 'ms'));
});

req.on('error', e => console.error('ERROR:', e.message));
req.write(payload);
req.end();

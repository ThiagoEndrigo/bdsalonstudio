const fs = require('fs');
const https = require('https');
const zlib = require('zlib');

const filePath = 'banco_salonstudio_2026-08-17_12-00-01.sql';
const rawBuffer = fs.readFileSync(filePath);
const compressedBuffer = zlib.gzipSync(rawBuffer);

const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';

const header = `--${boundary}\r\nContent-Disposition: form-data; name="sqlFile"; filename="banco.sql.gz"\r\nContent-Type: application/gzip\r\n\r\n`;
const footer = `\r\n--${boundary}--\r\n`;

const payload = Buffer.concat([
  Buffer.from(header, 'utf8'),
  compressedBuffer,
  Buffer.from(footer, 'utf8')
]);

console.log('Original size:', (rawBuffer.length / 1024 / 1024).toFixed(2), 'MB');
console.log('Sending compressed upload of', payload.length, 'bytes (', (payload.length / 1024 / 1024).toFixed(2), 'MB ) to Render...');
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

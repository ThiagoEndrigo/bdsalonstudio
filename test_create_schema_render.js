const https = require('https');

function poll() {
  https.get('https://bdsalonstudio.onrender.com/api/test-create-schema', res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`[${new Date().toLocaleTimeString()}] STATUS: ${res.statusCode}`);
      console.log('RESPONSE:', data);
      if (res.statusCode === 200) {
        process.exit(0);
      }
    });
  }).on('error', err => {
    console.log('Error:', err.message);
  });
}

console.log('Polling /api/test-create-schema on Render...');
poll();
const interval = setInterval(poll, 10000);

setTimeout(() => {
  clearInterval(interval);
  process.exit(1);
}, 180000);

const https = require('https');

function check() {
  https.get('https://bdsalonstudio.onrender.com/api/version', res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`[${new Date().toLocaleTimeString()}] Status: ${res.statusCode} | Response: ${data}`);
      if (data.includes('v3.5-mega-chunk-fix')) {
        console.log('✅ NEW VERSION IS LIVE ON RENDER!');
        process.exit(0);
      }
    });
  }).on('error', err => {
    console.log(`[${new Date().toLocaleTimeString()}] Connection error (deploying?): ${err.message}`);
  });
}

console.log('Polling Render for new deploy v3.5-mega-chunk-fix...');
check();
const interval = setInterval(check, 10000);

setTimeout(() => {
  clearInterval(interval);
  console.log('Polling timeout reached.');
  process.exit(1);
}, 180000);

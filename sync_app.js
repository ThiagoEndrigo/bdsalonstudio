const fs = require('fs');
const content = fs.readFileSync('public/app.js', 'utf8');
fs.writeFileSync('app.js', content, 'utf8');
console.log('Synchronized root app.js with public/app.js');

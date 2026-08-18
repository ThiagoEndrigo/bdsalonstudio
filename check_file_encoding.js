const fs = require('fs');

const buf = fs.readFileSync('banco_salonstudio_2026-08-17_12-00-01.sql');
console.log('First 20 bytes (hex):', buf.slice(0, 20).toString('hex'));
console.log('Byte 0:', buf[0], 'Byte 1:', buf[1], 'Byte 2:', buf[2]);

let utf8Str = buf.toString('utf8');
console.log('UTF-8 length:', utf8Str.length);
console.log('UTF-8 snippet:', utf8Str.slice(0, 200));

let utf16Str = buf.toString('utf16le');
console.log('UTF-16LE snippet:', utf16Str.slice(0, 200));

const zlib = require('zlib');
const AdmZip = require('adm-zip');
const fs = require('fs');

const rawSql = fs.readFileSync('banco_salonstudio_2026-08-17_12-00-01.sql');

// Test GZIP
const gzBuf = zlib.gzipSync(rawSql);
let decompGz = gzBuf;
if (decompGz[0] === 0x1f && decompGz[1] === 0x8b) {
  decompGz = zlib.gunzipSync(decompGz);
}
console.log('GZIP Decompress Match:', decompGz.length === rawSql.length);

// Test ZIP
const zip = new AdmZip();
zip.addFile('banco.sql', rawSql);
const zipBuf = zip.toBuffer();

let decompZip = zipBuf;
if (decompZip[0] === 0x50 && decompZip[1] === 0x4b) {
  const extracted = new AdmZip(decompZip);
  const sqlEntry = extracted.getEntries().find(e => e.entryName.endsWith('.sql'));
  if (sqlEntry) decompZip = sqlEntry.getData();
}
console.log('ZIP Decompress Match:', decompZip.length === rawSql.length);

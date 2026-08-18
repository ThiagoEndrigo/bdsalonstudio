const fs = require('fs');

function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inString = false;
  let quoteChar = '';

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    
    if (inString) {
      current += char;
      if (char === quoteChar) {
        if (i + 1 < sql.length && sql[i + 1] === quoteChar) {
          current += quoteChar;
          i++;
        } else {
          inString = false;
        }
      }
    } else {
      if (char === "'" || char === '"') {
        inString = true;
        quoteChar = char;
        current += char;
      } else if (char === ';') {
        const trimmed = current.trim();
        if (trimmed) statements.push(trimmed);
        current = '';
      } else {
        current += char;
      }
    }
  }
  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);
  return statements;
}

const rawSql = fs.readFileSync('banco_salonstudio_2026-08-17_12-00-01.sql', 'utf8');
const startTime = Date.now();
const stmts = splitSqlStatements(rawSql);
console.log('Linear parsed', stmts.length, 'statements in', Date.now() - startTime, 'ms');

const { Pool } = require('pg');
const fs = require('fs');

function convertCopyToInserts(sql) {
  if (!sql.includes('COPY') && !sql.includes('copy')) return sql;
  const lines = sql.split(/\r?\n/);
  const resultLines = [];
  let inCopy = false;
  let copyTable = '';
  let copyCols = '';

  for (let line of lines) {
    if (!inCopy) {
      const matchWithCols = line.match(/^COPY\s+([^\s]+)\s*\(([^)]+)\)\s+FROM\s+stdin;/i);
      const matchNoCols = line.match(/^COPY\s+([^\s]+)\s+FROM\s+stdin;/i);

      if (matchWithCols) {
        inCopy = true;
        copyTable = matchWithCols[1];
        copyCols = ` (${matchWithCols[2]})`;
        continue;
      } else if (matchNoCols) {
        inCopy = true;
        copyTable = matchNoCols[1];
        copyCols = '';
        continue;
      }
      resultLines.push(line);
    } else {
      if (line.trim() === '\\.') {
        inCopy = false;
        continue;
      }
      if (!line.trim()) continue;
      
      const values = line.split('\t').map(val => {
        if (val === '\\N') return 'NULL';
        const escaped = val.replace(/'/g, "''");
        return `'${escaped}'`;
      });
      resultLines.push(`INSERT INTO ${copyTable}${copyCols} VALUES (${values.join(', ')});`);
    }
  }
  return resultLines.join('\n');
}

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

async function run() {
  const pool = new Pool({
    host: '127.0.0.1',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'salonstudio'
  });

  const rawSql = fs.readFileSync('banco_salonstudio_2026-08-17_12-00-01.sql', 'utf8');
  let cleanSql = convertCopyToInserts(rawSql).replace(/^\\.*$/gm, '').trim();

  // Add IF NOT EXISTS to DDL statements
  cleanSql = cleanSql.replace(/CREATE SCHEMA ([^\s;]+);/gi, 'CREATE SCHEMA IF NOT EXISTS $1;');
  cleanSql = cleanSql.replace(/CREATE TABLE ([^\s(]+)/gi, 'CREATE TABLE IF NOT EXISTS $1');
  cleanSql = cleanSql.replace(/CREATE SEQUENCE ([^\s;]+)/gi, 'CREATE SEQUENCE IF NOT EXISTS $1');
  cleanSql = cleanSql.replace(/CREATE INDEX ([^\s]+)\s+ON/gi, 'CREATE INDEX IF NOT EXISTS $1 ON');

  const startTime = Date.now();
  const client = await pool.connect();
  
  const statements = splitSqlStatements(cleanSql);
  console.log(`Parsed ${statements.length} statements.`);

  const ddlStatements = [];
  const insertStatements = [];

  for (const stmt of statements) {
    if (stmt.toUpperCase().startsWith('INSERT INTO')) {
      insertStatements.push(stmt);
    } else {
      ddlStatements.push(stmt);
    }
  }

  console.log(`DDL statements: ${ddlStatements.length}, INSERT statements: ${insertStatements.length}`);

  // 1. Execute DDL in a single block or small chunks
  try {
    await client.query(ddlStatements.join(';\n') + ';');
  } catch (err) {
    for (const stmt of ddlStatements) {
      try { await client.query(stmt + ';'); } catch (e) {}
    }
  }

  // 2. Execute INSERTS in large chunks of 1,000 statements
  const batchSize = 1000;
  for (let i = 0; i < insertStatements.length; i += batchSize) {
    const chunk = insertStatements.slice(i, i + batchSize).join(';\n') + ';';
    try {
      await client.query(chunk);
    } catch (err) {
      for (const stmt of insertStatements.slice(i, i + batchSize)) {
        try { await client.query(stmt + ';'); } catch (e) {}
      }
    }
  }

  console.log(`Import COMPLETE in ${Date.now() - startTime} ms!`);
  client.release();
  await pool.end();
}

run();

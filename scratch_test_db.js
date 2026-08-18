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
  let cleanSql = convertCopyToInserts(rawSql);

  const cleanLines = cleanSql.split(/\r?\n/).filter(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('\\')) return false;
    if (trimmed.includes('OWNER TO')) return false;
    if (trimmed.includes('EXTENSION')) return false;
    if (trimmed.includes('GRANT ')) return false;
    if (trimmed.includes('REVOKE ')) return false;
    return true;
  });
  cleanSql = cleanLines.join('\n');

  // Extract schemas to drop old conflicting versions for ultra-fast clean restore
  const schemaMatches = cleanSql.match(/CREATE SCHEMA ([^\s;]+);/gi) || [];
  const schemasToDrop = schemaMatches.map(s => s.replace(/CREATE SCHEMA ([^\s;]+);/i, '$1'));

  const startTime = Date.now();
  const client = await pool.connect();
  
  for (const schema of schemasToDrop) {
    if (schema !== 'public') {
      try { await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE;`); } catch (e) {}
    }
  }

  // Inject DROP TYPE IF EXISTS CASCADE before CREATE TYPE
  cleanSql = cleanSql.replace(/CREATE TYPE ([^\s]+)/gi, 'DROP TYPE IF EXISTS $1 CASCADE; CREATE TYPE $1');
  cleanSql = cleanSql.replace(/CREATE SCHEMA ([^\s;]+);/gi, 'CREATE SCHEMA IF NOT EXISTS $1;');
  cleanSql = cleanSql.replace(/CREATE TABLE ([^\s(]+)/gi, 'CREATE TABLE IF NOT EXISTS $1');

  const statements = splitSqlStatements(cleanSql);
  console.log(`Parsed ${statements.length} statements.`);

  let successCount = 0;
  const batchSize = 1000;
  for (let i = 0; i < statements.length; i += batchSize) {
    const chunkStatements = statements.slice(i, i + batchSize);
    const chunkSql = chunkStatements.join(';\n') + ';';
    try {
      await client.query(chunkSql);
      successCount += chunkStatements.length;
      console.log(`Batch ${i} SUCCESS!`);
    } catch (batchErr) {
      console.warn(`Batch ${i} failed:`, batchErr.message);
      for (const stmt of chunkStatements) {
        try { await client.query(stmt + ';'); successCount++; } catch (e) {}
      }
    }
  }

  console.log(`IMPORT COMPLETED IN ${Date.now() - startTime} ms with ${successCount} / ${statements.length} successful statements!`);
  client.release();
  await pool.end();
}

run();

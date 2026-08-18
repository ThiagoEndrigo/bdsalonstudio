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

  // Strip superuser-only meta commands (EXTENSION, OWNER TO, GRANT)
  cleanSql = cleanSql.replace(/^.*EXTENSION.*$/gm, '');
  cleanSql = cleanSql.replace(/^.*OWNER TO .*$/gm, '');
  cleanSql = cleanSql.replace(/^.*GRANT ALL ON .*$/gm, '');

  // Extract schemas to drop old conflicting versions for ultra-fast clean restore
  const schemaMatches = cleanSql.match(/CREATE SCHEMA ([^\s;]+);/gi) || [];
  const schemasToDrop = schemaMatches.map(s => s.replace(/CREATE SCHEMA ([^\s;]+);/i, '$1'));

  console.log('Schemas to clean:', schemasToDrop);

  const startTime = Date.now();
  const client = await pool.connect();
  
  for (const schema of schemasToDrop) {
    if (schema !== 'public') {
      try { await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE;`); } catch (e) {}
    }
  }

  cleanSql = cleanSql.replace(/CREATE SCHEMA ([^\s;]+);/gi, 'CREATE SCHEMA IF NOT EXISTS $1;');
  cleanSql = cleanSql.replace(/CREATE TABLE ([^\s(]+)/gi, 'CREATE TABLE IF NOT EXISTS $1');

  try {
    await client.query('BEGIN;');
    await client.query(cleanSql);
    await client.query('COMMIT;');
    console.log(`CLEAN SINGLE-TRANSACTION IMPORT SUCCESS in ${Date.now() - startTime} ms!`);
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('Error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();

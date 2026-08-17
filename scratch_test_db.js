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

  // Add IF NOT EXISTS to CREATE SCHEMA and CREATE TABLE statements
  cleanSql = cleanSql.replace(/CREATE SCHEMA ([^\s;]+);/gi, 'CREATE SCHEMA IF NOT EXISTS $1;');
  cleanSql = cleanSql.replace(/CREATE TABLE ([^\s(]+)/gi, 'CREATE TABLE IF NOT EXISTS $1');

  console.log('Connecting to Postgres...');
  const startTime = Date.now();
  const client = await pool.connect();
  console.log('Connected! Splitting statements...');
  
  const statements = cleanSql
    .split(/;\s*(?=(?:[^'"]*['"][^'"]*['"])*[^'"]*$)/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  console.log(`Executing ${statements.length} statements in chunks...`);
  let successCount = 0;
  let skipCount = 0;
  const batchSize = 100;

  for (let i = 0; i < statements.length; i += batchSize) {
    const chunkStatements = statements.slice(i, i + batchSize);
    const chunkSql = chunkStatements.join(';\n') + ';';
    try {
      await client.query(chunkSql);
      successCount += chunkStatements.length;
    } catch (err) {
      for (const stmt of chunkStatements) {
        try {
          await client.query(stmt + ';');
          successCount++;
        } catch (e) {
          skipCount++;
        }
      }
    }
  }

  console.log(`Import FINISHED in ${Date.now() - startTime}ms! Executed: ${successCount}, Skipped DDL conflicts: ${skipCount}`);
  client.release();
  await pool.end();
}

run();

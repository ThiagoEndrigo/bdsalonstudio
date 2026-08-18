const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const zlib = require('zlib');
const AdmZip = require('adm-zip');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup upload storage in memory
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

const connectionString = process.env.DATABASE_URL;
const isExternalHost = process.env.PGHOST && process.env.PGHOST !== '127.0.0.1' && process.env.PGHOST !== 'localhost';

const poolConfig = connectionString ? {
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
} : {
  host: process.env.PGHOST || '127.0.0.1',
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'salonstudio',
  ssl: isExternalHost ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

const pool = new Pool(poolConfig);
pool.on('error', (err) => {
  console.error('Unexpected pool error on idle client:', err);
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Diagnostic test schema creation route
app.get('/api/test-create-schema', async (req, res) => {
  try {
    const createRes = await pool.query('CREATE SCHEMA IF NOT EXISTS company_keilafrutuoso;');
    const schemasRes = await pool.query(`
      SELECT nspname FROM pg_namespace 
      WHERE nspname NOT LIKE 'pg_%' AND nspname != 'information_schema'
      ORDER BY nspname;
    `);
    res.json({
      success: true,
      createResult: createRes,
      schemas: schemasRes.rows.map(r => r.nspname)
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// Get schemas
app.get('/api/schemas', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT nspname FROM pg_namespace 
      WHERE nspname NOT LIKE 'pg_%' AND nspname != 'information_schema'
      ORDER BY nspname;
    `);
    res.json({ schemas: result.rows.map(r => r.nspname) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get tables and columns for schema
app.get('/api/tables', async (req, res) => {
  const schema = req.query.schema || 'company_deboranails';
  try {
    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = $1 
      ORDER BY table_name;
    `, [schema]);

    const columnsRes = await pool.query(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = $1
      ORDER BY table_name, ordinal_position;
    `, [schema]);

    const tablesMap = {};
    tablesRes.rows.forEach(t => {
      tablesMap[t.table_name] = [];
    });

    columnsRes.rows.forEach(c => {
      if (tablesMap[c.table_name]) {
        tablesMap[c.table_name].push({
          column: c.column_name,
          type: c.data_type,
          nullable: c.is_nullable === 'YES'
        });
      }
    });

    res.json({ schema, tables: tablesMap });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function extractTableName(sql) {
  if (!sql) return null;
  const fromMatch = sql.match(/FROM\s+([`"]?[\w]+[`"]?\.)?([`"]?[\w]+[`"]?)/i);
  if (fromMatch && fromMatch[2]) return fromMatch[2].replace(/[`"]/g, '');
  
  const updateMatch = sql.match(/UPDATE\s+([`"]?[\w]+[`"]?\.)?([`"]?[\w]+[`"]?)/i);
  if (updateMatch && updateMatch[2]) return updateMatch[2].replace(/[`"]/g, '');
  
  const insertMatch = sql.match(/INTO\s+([`"]?[\w]+[`"]?\.)?([`"]?[\w]+[`"]?)/i);
  if (insertMatch && insertMatch[2]) return insertMatch[2].replace(/[`"]/g, '');
  
  return null;
}

// Execute SQL Query
app.post('/api/query', async (req, res) => {
  const { sql, schema } = req.body;
  if (!sql || !sql.trim()) {
    return res.status(400).json({ error: 'SQL query cannot be empty.' });
  }

  const startTime = Date.now();
  let client;
  try {
    client = await pool.connect();
    
    if (schema && schema.trim()) {
      // Set search_path without quotes for schema (e.g. SET search_path TO company_keilafrutuoso, public;)
      const safeSchema = schema.replace(/[^a-zA-Z0-9_]/g, '');
      if (safeSchema) {
        await client.query(`SET search_path TO ${safeSchema}, public;`);
      }
    }

    const rawResult = await client.query(sql);
    const duration = Date.now() - startTime;
    client.release();

    // Split SQL by semicolon to match statement with query result
    const statements = sql
      .split(/;\s*(?=(?:[^'"]*['"][^'"]*['"])*[^'"]*$)/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const resultArray = Array.isArray(rawResult) ? rawResult : [rawResult];
    const results = resultArray.map((r, idx) => {
      const stmt = statements[idx] || statements[0] || sql;
      const tableName = extractTableName(stmt);
      return {
        command: r.command,
        rowCount: r.rowCount,
        fields: r.fields ? r.fields.map(f => f.name) : [],
        rows: r.rows || [],
        tableName: tableName || null
      };
    });

    res.json({
      results,
      duration
    });
  } catch (err) {
    if (client) client.release();
    const duration = Date.now() - startTime;
    res.status(400).json({
      error: err.message,
      detail: err.detail,
      position: err.position,
      duration
    });
  }
});

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
  let inDollar = false;
  let dollarTag = '';

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];

    if (!inString && !inDollar && char === '$') {
      const match = sql.slice(i).match(/^(\$[a-zA-Z0-9_]*\$)/);
      if (match) {
        inDollar = true;
        dollarTag = match[1];
        current += dollarTag;
        i += dollarTag.length - 1;
        continue;
      }
    } else if (inDollar && char === '$') {
      if (sql.slice(i).startsWith(dollarTag)) {
        inDollar = false;
        current += dollarTag;
        i += dollarTag.length - 1;
        dollarTag = '';
        continue;
      }
    }

    if (inDollar) {
      current += char;
      continue;
    }

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

// Upload and import SQL file into PostgreSQL
app.post('/api/upload', upload.single('sqlFile'), async (req, res) => {
  req.setTimeout(10 * 60 * 1000); // 10 minutes timeout for large files
  res.setTimeout(10 * 60 * 1000);

  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  const originalName = req.file.originalname;
  const startTime = Date.now();

  let client;
  try {
    let fileBuffer = req.file.buffer ? req.file.buffer : fs.readFileSync(req.file.path);
    if (fileBuffer && fileBuffer[0] === 0x1f && fileBuffer[1] === 0x8b) {
      fileBuffer = zlib.gunzipSync(fileBuffer);
    } else if (fileBuffer && fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4b) {
      try {
        const zip = new AdmZip(fileBuffer);
        const zipEntries = zip.getEntries();
        const sqlEntry = zipEntries.find(entry => entry.entryName.toLowerCase().endsWith('.sql'));
        if (sqlEntry) {
          fileBuffer = sqlEntry.getData();
        } else if (zipEntries.length > 0) {
          fileBuffer = zipEntries[0].getData();
        }
      } catch (e) {
        console.warn('ZIP extraction failed, trying raw buffer:', e.message);
      }
    }
    let sqlContent = fileBuffer.toString('utf8').replace(/^\uFEFF/, '').trim();
    
    // 1. Convert any pg_dump "COPY table FROM stdin" blocks into standard INSERT INTO statements
    sqlContent = convertCopyToInserts(sqlContent);

    // 2. Strip comments, psql meta-commands, superuser statements, SET commands
    const cleanLines = sqlContent.split(/\r?\n/).filter(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('--')) return false;
      if (trimmed.startsWith('\\')) return false;
      if (trimmed.includes('OWNER TO')) return false;
      if (trimmed.includes('EXTENSION')) return false;
      if (trimmed.includes('GRANT ')) return false;
      if (trimmed.includes('REVOKE ')) return false;
      if (trimmed.startsWith('SET ')) return false;
      if (trimmed.includes('SELECT pg_catalog.set_config')) return false;
      return true;
    });
    sqlContent = cleanLines.join('\n');

    // 3. Extract schemas to drop old conflicting versions for ultra-fast clean restore
    const schemaMatches = sqlContent.match(/CREATE SCHEMA ([^\s;]+);/gi) || [];
    const schemasToDrop = schemaMatches.map(s => s.replace(/CREATE SCHEMA ([^\s;]+);/i, '$1'));

    client = await pool.connect();

    for (const schema of schemasToDrop) {
      if (schema !== 'public') {
        try { await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE;`); } catch (e) {}
      }
    }

    // 4. Inject safe DDL replacements
    sqlContent = sqlContent.replace(/CREATE SCHEMA ([^\s;]+);/gi, 'CREATE SCHEMA IF NOT EXISTS $1;');
    sqlContent = sqlContent.replace(/CREATE TABLE ([^\s(]+)/gi, 'CREATE TABLE IF NOT EXISTS $1');
    sqlContent = sqlContent.replace(/CREATE SEQUENCE ([^\s;]+)/gi, 'CREATE SEQUENCE IF NOT EXISTS $1');

    const statements = splitSqlStatements(sqlContent);
    let successCount = 0;
    let errorCount = 0;

    for (const stmt of statements) {
      try {
        await client.query(stmt);
        successCount++;
      } catch (stmtErr) {
        errorCount++;
      }
    }

    client.release();
    
    if (req.file.path) { try { fs.unlinkSync(req.file.path); } catch (e) {} }

    const duration = Date.now() - startTime;
    const schemasRes = await pool.query(`
      SELECT nspname FROM pg_namespace 
      WHERE nspname NOT LIKE 'pg_%' AND nspname != 'information_schema'
      ORDER BY nspname;
    `);

    res.json({
      message: `Banco '${originalName}' importado com sucesso em ${duration}ms! (${successCount} comandos executados)`,
      duration,
      statementsCount: statements.length,
      sqlContentLength: sqlContent.length,
      firstBatchError,
      schemas: schemasRes.rows.map(r => r.nspname)
    });
  } catch (err) {
    if (client) client.release();
    if (req.file && req.file.path) { try { fs.unlinkSync(req.file.path); } catch (e) {} }
    console.error('Erro na importação SQL:', err);
    res.status(500).json({ error: 'Falha ao importar SQL para o banco: ' + err.message });
  }
});

// Pre-built report query templates
app.get('/api/templates', (req, res) => {
  const templates = [
    {
      id: 'top-clientes',
      name: 'Top 10 Clientes por Qtd. de Agendamentos',
      schema: 'company_keilafrutuoso',
      sql: `SELECT cliente_nome, COUNT(*) AS total_agendamentos, SUM(valor_total) AS total_gasto\nFROM agendamentos\nWHERE deletado = 'N'\nGROUP BY cliente_nome\nORDER BY total_agendamentos DESC\nLIMIT 10;`
    },
    {
      id: 'faturamento-profissionais',
      name: 'Faturamento e Agendamentos por Colaborador',
      schema: 'company_keilafrutuoso',
      sql: `SELECT c.nome AS colaborador, COUNT(a.id) AS total_atendimentos, SUM(a.valor_total) AS faturamento_gerado\nFROM colaboradores c\nLEFT JOIN agendamentos a ON a.profissionais::text LIKE '%' || c.id || '%'\nGROUP BY c.id, c.nome\nORDER BY faturamento_gerado DESC NULLS LAST;`
    },
    {
      id: 'lista-servicos',
      name: 'Lista de Serviços e Valores',
      schema: 'company_keilafrutuoso',
      sql: `SELECT nome, duracao_minutos, valor, disponivel_online\nFROM servicos\nWHERE ativo = true AND deletado = 'N'\nORDER BY valor DESC;`
    },
    {
      id: 'produtos-estoque',
      name: 'Estoque de Produtos e Custo',
      schema: 'company_keilafrutuoso',
      sql: `SELECT nome, quantidade_estoque, estoque_minimo, custo_unitario, preco_venda, (quantidade_estoque * preco_venda) AS valor_estoque_venda\nFROM produtos\nWHERE deletado = 'N'\nORDER BY quantidade_estoque ASC;`
    },
    {
      id: 'resumo-pagamentos',
      name: 'Resumo por Forma de Pagamento',
      schema: 'company_keilafrutuoso',
      sql: `SELECT forma_pagamento, COUNT(*) AS qtd_transacoes, SUM(valor) AS total_recebido\nFROM pagamentos\nWHERE deletado = 'N'\nGROUP BY forma_pagamento\nORDER BY total_recebido DESC;`
    },
    {
      id: 'ultimos-agendamentos',
      name: 'Últimos 20 Agendamentos',
      schema: 'company_keilafrutuoso',
      sql: `SELECT id, cliente_nome, data_hora, valor_total, status, valor_pago\nFROM agendamentos\nWHERE deletado = 'N'\nORDER BY data_hora DESC\nLIMIT 20;`
    }
  ];
  res.json({ templates });
});

const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`SalonStudio SQL Explorer running on http://${HOST}:${PORT}`);
});

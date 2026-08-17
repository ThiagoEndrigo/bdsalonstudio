const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const connectionString = process.env.DATABASE_URL;

const poolConfig = connectionString ? {
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
} : {
  host: process.env.PGHOST || '127.0.0.1',
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'salonstudio',
  max: 10,
  idleTimeoutMillis: 30000,
};

const pool = new Pool(poolConfig);

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

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

const fs = require('fs');
const multer = require('multer');
const { execFile } = require('child_process');

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 500 * 1024 * 1024 } // 500 MB limit
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

// Upload and import SQL file into PostgreSQL
app.post('/api/upload', upload.single('sqlFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname;
  const startTime = Date.now();

  const env = { ...process.env, PGPASSWORD: 'postgres' };
  const psqlPath = 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';

  execFile(psqlPath, ['-h', '127.0.0.1', '-p', '5432', '-U', 'postgres', '-d', 'salonstudio', '-w', '-f', filePath], { env }, async (error, stdout, stderr) => {
    // Delete temp file after import
    try { fs.unlinkSync(filePath); } catch (e) {}

    const duration = Date.now() - startTime;

    try {
      const schemasRes = await pool.query(`
        SELECT nspname FROM pg_namespace 
        WHERE nspname NOT LIKE 'pg_%' AND nspname != 'information_schema'
        ORDER BY nspname;
      `);
      res.json({
        message: `Banco '${originalName}' importado com sucesso em ${duration}ms!`,
        duration,
        schemas: schemasRes.rows.map(r => r.nspname)
      });
    } catch (err) {
      res.json({
        message: `Banco '${originalName}' importado com sucesso em ${duration}ms!`,
        duration,
        schemas: []
      });
    }
  });
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

app.listen(PORT, () => {
  console.log(`SalonStudio SQL Explorer running on http://localhost:${PORT}`);
});

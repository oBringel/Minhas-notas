require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgres://notas:notas123@127.0.0.1:5432/notas',
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  keepAlive: true,                 // mantém a conexão aberta (sem reconectar a cada clique)
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 8000,
});

// Cria as tabelas se ainda não existirem
async function initDb() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
}

module.exports = { pool, initDb };

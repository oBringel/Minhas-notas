require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgres://notas:notas123@localhost:5432/notas',
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Cria as tabelas se ainda não existirem
async function initDb() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
}

module.exports = { pool, initDb };

require('dotenv').config();
const { Pool } = require('pg');

const useSsl =
  process.env.PGSSL === 'true' ||
  /sslmode=require/.test(process.env.DATABASE_URL || '');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: 5,
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de Postgres:', err.message);
});

module.exports = pool;

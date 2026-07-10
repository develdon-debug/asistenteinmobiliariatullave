require('dotenv').config();
const { Pool } = require('pg');

// trim(): los secrets/vars pegados suelen traer un salto de línea final que
// rompe la conexión ("database railway\n does not exist").
const connectionString = (process.env.DATABASE_URL || '').trim();

const useSsl =
  (process.env.PGSSL || '').trim() === 'true' ||
  /sslmode=require/.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: 5,
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de Postgres:', err.message);
});

module.exports = pool;

const fs = require('fs');
const path = require('path');
const pool = require('../db');

async function main() {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    console.log(`Aplicando ${file}...`);
    await pool.query(sql);
  }
  console.log('Migraciones aplicadas.');
  await pool.end();
}

main().catch((err) => {
  console.error('Error aplicando migraciones:', err.message);
  process.exit(1);
});

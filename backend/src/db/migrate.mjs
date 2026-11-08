// Menjalankan file SQL di src/db/migrations/ secara berurutan.
// Tiap file dijalankan sekali; yang sudah pernah jalan dilewati.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const done = new Set(
      (await client.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename),
    );
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

    let applied = 0;
    for (const file of files) {
      if (done.has(file)) {
        console.log(`- ${file}: sudah dijalankan, dilewati`);
        continue;
      }
      const sql = await readFile(path.join(dir, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`- ${file}: berhasil`);
        applied += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migrasi ${file} gagal dan dibatalkan: ${err.message}`);
      }
    }
    console.log(applied === 0 ? 'Database sudah up to date.' : `Selesai: ${applied} migrasi dijalankan.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

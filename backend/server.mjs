// Entry point backend Tomodachiqua Depot.
import { env } from './src/config/env.mjs';
import { createApp } from './src/app.mjs';
import { pool } from './src/db/pool.mjs';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`Server berjalan di port ${env.PORT} (${env.NODE_ENV})`);
});

async function shutdown(signal) {
  console.log(`${signal} diterima, menutup server...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

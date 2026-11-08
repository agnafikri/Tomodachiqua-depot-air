import pg from 'pg';
import { env } from '../config/env.mjs';

// Neon memberi DATABASE_URL yang sudah memuat sslmode=require; pg membacanya otomatis.
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  // Neon bisa tidur saat sepi; beri waktu cukup untuk bangun.
  connectionTimeoutMillis: 20_000,
});

pool.on('error', (err) => {
  console.error('Kesalahan koneksi database (idle):', err.message);
});

export function query(text, params) {
  return pool.query(text, params);
}

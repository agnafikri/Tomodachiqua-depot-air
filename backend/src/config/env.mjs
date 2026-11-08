import 'dotenv/config';
import { z } from 'zod';

// Zona waktu proses Node: laporan dan tanggal mengikuti Asia/Jakarta.
process.env.TZ = process.env.TZ || 'Asia/Jakarta';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL wajib diisi di backend/.env'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET minimal 32 karakter'),
  // Boleh lebih dari satu asal, dipisah koma.
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  SESSION_DAYS: z.coerce.number().int().positive().default(7),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Konfigurasi .env tidak valid:');
  for (const issue of parsed.error.issues) {
    console.error(`- ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
  corsOrigins: parsed.data.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
};

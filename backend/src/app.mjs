import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.mjs';
import { pool } from './db/pool.mjs';
import { errorHandler, notFound } from './middleware/errorHandler.mjs';
import { requireCsrfHeader } from './middleware/requireCsrfHeader.mjs';
import adminRouter from './routes/admin.mjs';
import { authRouter } from './routes/auth.mjs';
import customersRouter from './routes/customers.mjs';
import ordersRouter from './routes/orders.mjs';

export function createApp({ loginMax = 10 } = {}) {
  const app = express();

  // Render berada di belakang proxy; perlu agar IP asli terbaca (rate limit).
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // Tanpa header Origin (curl, health check) diizinkan.
        if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Health check Render. Tidak menyentuh database agar tetap cepat.
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  // Cek koneksi database (dipakai saat setup).
  app.get('/api/health/db', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'terhubung' });
  });

  app.use('/api', requireCsrfHeader);
  app.use('/api/auth', authRouter({ loginMax }));
  app.use('/api/customers', customersRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/admin', adminRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

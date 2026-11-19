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
import debtsRouter from './routes/debts.mjs';
import employeesRouter from './routes/employees.mjs';
import exportRouter from './routes/export.mjs';
import expensesRouter from './routes/expenses.mjs';
import importRouter from './routes/import.mjs';
import ordersRouter from './routes/orders.mjs';
import paymentsRouter from './routes/payments.mjs';
import { publicRequestsRouter } from './routes/publicRequests.mjs';
import serviceRequestsRouter from './routes/serviceRequests.mjs';
import personalUseRouter from './routes/personalUse.mjs';
import financeRouter from './routes/finance.mjs';
import reportsRouter from './routes/reports.mjs';
import summaryRouter from './routes/summary.mjs';
import tankRouter from './routes/tank.mjs';
import wagesRouter from './routes/wages.mjs';

export function createApp({ loginMax = 10, publicMax = 5 } = {}) {
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
      exposedHeaders: ['Content-Disposition'], // agar frontend lintas domain bisa membaca nama berkas unduhan
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
  app.use('/api/summary', summaryRouter);
  app.use('/api/debts', debtsRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/tank', tankRouter);
  app.use('/api/personal-use', personalUseRouter);
  app.use('/api/expenses', expensesRouter);
  app.use('/api/public', publicRequestsRouter({ max: publicMax })); // tanpa login (landing page)
  app.use('/api/service-requests', serviceRequestsRouter);
  app.use('/api/export', exportRouter);
  app.use('/api/import', importRouter);
  app.use('/api/employees', employeesRouter);
  app.use('/api/wages', wagesRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/finance', financeRouter);
  app.use('/api/admin', adminRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

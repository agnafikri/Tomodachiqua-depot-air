import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.mjs';
import { requireRole } from '../middleware/requireRole.mjs';
import { buildBackupWorkbook, buildPeriodWorkbook } from '../services/excel/export.mjs';
import { periodQuery } from './periodQuery.mjs';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function sendWorkbook(res, workbook, fileName) {
  res.setHeader('Content-Type', XLSX);
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.setHeader('Cache-Control', 'no-store');
  await workbook.xlsx.write(res);
  res.end();
}

const router = Router();
router.use(requireAuth);

// Laporan satu periode: boleh untuk ADMIN dan PEMILIK (hanya baca; datanya sama dengan layar Laporan).
router.get('/report.xlsx', async (req, res) => {
  const { period, date } = periodQuery.parse(req.query);
  const { workbook, fileName } = await buildPeriodWorkbook({ period, date });
  await sendWorkbook(res, workbook, fileName);
});

// Cadangan lengkap seluruh data: khusus ADMIN.
router.get('/backup.xlsx', requireRole('ADMIN'), async (_req, res) => {
  const { workbook, fileName } = await buildBackupWorkbook();
  await sendWorkbook(res, workbook, fileName);
});

export default router;

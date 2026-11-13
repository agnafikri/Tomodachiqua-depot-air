import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppError } from '../errors.mjs';
import { requireAuth } from '../middleware/requireAuth.mjs';
import { requireRole } from '../middleware/requireRole.mjs';
import { analyze, commitImport, listBatches, voidBatch } from '../services/excel/import.mjs';
import { KIND_BY_SLUG, KINDS, MAX_FILE_BYTES } from '../services/excel/kinds.mjs';
import { buildTemplate } from '../services/excel/templates.mjs';
import { sendWorkbook } from './export.mjs';

// Semua rute impor khusus ADMIN.
const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } }).single('file');

function receiveFile(req, _res, next) {
  upload(req, _res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, 'FILE_TOO_LARGE', 'Berkas terlalu besar (maksimal 5 MB).'));
      return next(new AppError(400, 'UPLOAD_ERROR', 'Berkas yang diunggah tidak bisa dibaca.'));
    }
    if (!req.file) return next(new AppError(400, 'NO_FILE', 'Pilih berkas Excel (.xlsx) dulu.'));
    return next();
  });
}

const kindOf = (slug) => {
  const kind = KIND_BY_SLUG[String(slug).replace(/\.xlsx$/i, '')];
  if (!kind) throw new AppError(404, 'UNKNOWN_KIND', 'Jenis impor tidak dikenal.');
  return kind;
};
// Nama berkas dari multer berupa latin1; kembalikan ke UTF-8.
const fileNameOf = (file) => Buffer.from(file.originalname, 'latin1').toString('utf8');

router.get('/templates/:slug', async (req, res) => {
  const kind = kindOf(req.params.slug);
  await sendWorkbook(res, await buildTemplate(kind), `template-${KINDS[kind].slug}.xlsx`);
});

router.get('/batches', async (_req, res) => {
  res.json({ batches: await listBatches() });
});

router.patch('/batches/:id', async (req, res) => {
  z.object({ voided: z.literal(true) }).parse(req.body);
  res.json(await voidBatch(z.coerce.number().int().positive().parse(req.params.id), req.user));
});

// Periksa saja (dry-run): tidak ada yang disimpan.
router.post('/:slug/check', receiveFile, async (req, res) => {
  const { result } = await analyze(kindOf(req.params.slug), req.file.buffer, fileNameOf(req.file));
  res.json({ result });
});

// Simpan: memeriksa ulang seluruh berkas, lalu menyimpan semua baris dalam satu transaksi.
router.post('/:slug', receiveFile, async (req, res) => {
  const done = await commitImport(kindOf(req.params.slug), req.file.buffer, fileNameOf(req.file), req.user);
  res.status(201).json({ import: done });
});

export default router;

import { ZodError } from 'zod';
import { AppError } from '../errors.mjs';

export function notFound(_req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Alamat tidak ditemukan.' } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Data yang dikirim belum benar.',
        details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      },
    });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Format data tidak valid.' } });
  }
  console.error(err);
  return res
    .status(500)
    .json({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan di server.' } });
}

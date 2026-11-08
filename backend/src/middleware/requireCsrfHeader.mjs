import { AppError } from '../errors.mjs';

// Cookie sesi memakai sameSite=none di produksi. Sebagai pengaman tambahan,
// semua permintaan yang mengubah data wajib membawa header khusus; header ini
// memaksa browser melakukan preflight CORS yang hanya lolos untuk CORS_ORIGIN.
export function requireCsrfHeader(req, _res, next) {
  const safe = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (!safe && req.get('X-Requested-With') !== 'tomodachiqua') {
    throw new AppError(403, 'CSRF_BLOCKED', 'Permintaan ditolak.');
  }
  next();
}

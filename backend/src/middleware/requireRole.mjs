import { AppError } from '../errors.mjs';

// Pakai setelah requireAuth. Contoh: router.use(requireAuth, requireRole('ADMIN'))
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'Kamu tidak punya akses ke halaman ini.');
    }
    next();
  };
}

import { AppError } from '../errors.mjs';
import { SESSION_COOKIE, findActiveUser, readSession } from '../services/auth.mjs';

// Memastikan ada sesi valid; pengguna dimuat ulang dari database agar
// perubahan peran atau penonaktifan langsung berlaku.
export async function requireAuth(req, _res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  const session = token ? readSession(token) : null;
  if (!session) throw new AppError(401, 'UNAUTHENTICATED', 'Silakan login terlebih dahulu.');

  const user = await findActiveUser(session.sub);
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Sesi tidak berlaku. Silakan login lagi.');

  req.user = { id: Number(user.id), name: user.name, username: user.username, role: user.role };
  next();
}

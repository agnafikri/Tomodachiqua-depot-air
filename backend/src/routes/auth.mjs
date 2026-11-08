import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.mjs';
import {
  clearSessionCookie,
  publicUser,
  setSessionCookie,
  signSession,
  verifyCredentials,
} from '../services/auth.mjs';

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username wajib diisi').max(100),
  password: z.string().min(1, 'Password wajib diisi').max(200),
});

export function authRouter({ loginMax = 10 } = {}) {
  const router = Router();

  // Hanya percobaan gagal yang dihitung.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: loginMax,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      error: { code: 'TOO_MANY_ATTEMPTS', message: 'Terlalu banyak percobaan login. Coba lagi beberapa menit lagi.' },
    },
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);
    const user = await verifyCredentials(username, password);
    setSessionCookie(res, signSession(user));
    res.json({ user: publicUser(user) });
  });

  router.post('/logout', (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}

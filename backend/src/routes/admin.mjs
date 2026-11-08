import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.mjs';
import { requireRole } from '../middleware/requireRole.mjs';

// Semua rute di sini khusus ADMIN. Fitur admin berikutnya (impor, data master) menyusul di sini.
const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

router.get('/ping', (req, res) => {
  res.json({ ok: true, role: req.user.role });
});

export default router;

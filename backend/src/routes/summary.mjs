import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.mjs';
import { getSummary } from '../services/summary.mjs';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  res.json(await getSummary());
});

export default router;

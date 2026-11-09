import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.mjs';
import { getFinance } from '../services/reports.mjs';
import { periodQuery } from './periodQuery.mjs';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  res.json(await getFinance(periodQuery.parse(req.query)));
});

export default router;

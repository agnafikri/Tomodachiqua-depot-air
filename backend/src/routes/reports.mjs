import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.mjs';
import { getReport } from '../services/reports.mjs';
import { periodQuery } from './periodQuery.mjs';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  res.json(await getReport(periodQuery.parse(req.query)));
});

export default router;

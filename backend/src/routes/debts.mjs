import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.mjs';
import { getCustomerDebt, listDebts } from '../services/debts.mjs';

const router = Router();
router.use(requireAuth);

const id = z.coerce.number().int().positive();

router.get('/', async (_req, res) => {
  res.json(await listDebts());
});

router.get('/customers/:id', async (req, res) => {
  res.json(await getCustomerDebt(id.parse(req.params.id), req.user));
});

export default router;

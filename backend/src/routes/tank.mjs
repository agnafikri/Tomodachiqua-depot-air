import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.mjs';
import { jakartaDate } from '../services/clock.mjs';
import { getTankStatus } from '../services/stock.mjs';
import { addAdjustment, addRefill, listHistory, voidRefill } from '../services/tank.mjs';

const router = Router();
router.use(requireAuth);

const note = z
  .string()
  .trim()
  .max(200)
  .transform((v) => (v === '' ? null : v))
  .nullish();

// Tanggal tidak boleh di masa depan (menurut jam server, zona Jakarta).
const pastOrToday = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD.')
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), 'Tanggal tidak valid.')
  .refine((d) => d <= jakartaDate(), 'Tanggal tidak boleh di masa depan.');

const id = z.coerce.number().int().positive();
const voidBody = z.object({ voided: z.literal(true) });

const refillSchema = z.object({
  refillDate: pastOrToday.optional(),
  liters: z.number().int('Liter harus bilangan bulat.').min(1, 'Minimal 1 liter.').max(1_000_000),
  note,
  clientRequestId: z.uuid().optional(),
});
const adjustmentSchema = z.object({
  litersAfter: z.number().int('Liter harus bilangan bulat.').min(0, 'Tidak boleh negatif.').max(1_000_000),
  note,
  clientRequestId: z.uuid().optional(),
});
const created = (res, r) => res.status(r.duplicate ? 200 : 201).json({ id: r.id, duplicate: r.duplicate });

router.get('/', async (_req, res) => {
  res.json({ tank: await getTankStatus() });
});

router.get('/history', async (req, res) => {
  res.json({ items: await listHistory(req.user) });
});

router.post('/refills', async (req, res) => created(res, await addRefill(refillSchema.parse(req.body), req.user)));
router.post('/adjustments', async (req, res) => created(res, await addAdjustment(adjustmentSchema.parse(req.body), req.user)));

router.patch('/refills/:id', async (req, res) => {
  voidBody.parse(req.body);
  await voidRefill(id.parse(req.params.id), req.user);
  res.json({ ok: true });
});
export default router;

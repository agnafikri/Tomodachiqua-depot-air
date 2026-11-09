import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.mjs';
import { jakartaDate } from '../services/clock.mjs';
import { isCalendarDate } from '../services/dates.mjs';
import { addPersonalUse, voidPersonalUse } from '../services/tank.mjs';

const router = Router();
router.use(requireAuth);

const note = z.string().trim().max(200).transform((v) => (v === '' ? null : v)).nullish();
const pastOrToday = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD.')
  .refine(isCalendarDate, 'Tanggal tidak valid.')
  .refine((d) => !isCalendarDate(d) || d <= jakartaDate(), 'Tanggal tidak boleh di masa depan.');

const personalSchema = z.object({
  useDate: pastOrToday.optional(),
  gallons: z.number().int('Jumlah galon harus bilangan bulat.').min(1, 'Minimal 1 galon.').max(500, 'Maksimal 500 galon.'),
  note,
  clientRequestId: z.uuid().optional(),
});

router.post('/', async (req, res) => {
  const r = await addPersonalUse(personalSchema.parse(req.body), req.user);
  res.status(r.duplicate ? 200 : 201).json({ id: r.id, duplicate: r.duplicate });
});

router.patch('/:id', async (req, res) => {
  z.object({ voided: z.literal(true) }).parse(req.body);
  await voidPersonalUse(z.coerce.number().int().positive().parse(req.params.id), req.user);
  res.json({ ok: true });
});

export default router;

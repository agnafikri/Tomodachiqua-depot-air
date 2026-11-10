import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.mjs';
import { jakartaDate } from '../services/clock.mjs';
import { isCalendarDate } from '../services/dates.mjs';
import { EXPENSE_CODES } from '../services/expenseCategories.mjs';
import { addExpense, listExpenses, voidExpense } from '../services/expenses.mjs';
import { periodQuery } from './periodQuery.mjs';
import { resolvePeriod } from '../services/period.mjs';

const router = Router();
router.use(requireAuth);

const expenseSchema = z.object({
  spentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD.')
    .refine(isCalendarDate, 'Tanggal tidak valid.')
    .refine((d) => !isCalendarDate(d) || d <= jakartaDate(), 'Tanggal tidak boleh di masa depan.')
    .optional(),
  category: z
    .string({ error: 'Pilih kategori pengeluaran.' })
    .superRefine((c, ctx) => {
      if (c === 'UPAH') ctx.addIssue({ code: 'custom', message: 'Upah dicatat lewat menu Upah, bukan di pengeluaran.' });
      else if (!EXPENSE_CODES.includes(c)) ctx.addIssue({ code: 'custom', message: 'Pilih kategori pengeluaran.' });
    }),
  amount: z.number().int('Jumlah harus bilangan bulat rupiah.').min(1, 'Jumlah minimal Rp 1.').max(1_000_000_000, 'Jumlah terlalu besar.'),
  note: z.string().trim().max(200).transform((v) => (v === '' ? null : v)).nullish(),
  clientRequestId: z.uuid().optional(),
});

// Daftar pengeluaran pada periode terpilih.
router.get('/', async (req, res) => {
  const { period, date } = periodQuery.parse(req.query);
  const today = jakartaDate();
  const range = resolvePeriod(period, date ?? today, today);
  res.json({ range: { from: range.from, to: range.to }, items: await listExpenses(range, req.user) });
});

router.post('/', async (req, res) => {
  const r = await addExpense(expenseSchema.parse(req.body), req.user);
  res.status(r.duplicate ? 200 : 201).json({ id: r.id, duplicate: r.duplicate });
});

router.patch('/:id', async (req, res) => {
  z.object({ voided: z.literal(true) }).parse(req.body);
  await voidExpense(z.coerce.number().int().positive().parse(req.params.id), req.user);
  res.json({ ok: true });
});

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.mjs';
import { jakartaDate } from '../services/clock.mjs';
import { isCalendarDate } from '../services/dates.mjs';
import { resolvePeriod } from '../services/period.mjs';
import { createWages, getSlip, getWageDay, listSlips, voidSlip } from '../services/wages.mjs';
import { periodQuery } from './periodQuery.mjs';

const router = Router();
router.use(requireAuth);

const pastOrToday = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD.')
  .refine(isCalendarDate, 'Tanggal tidak valid.')
  .refine((d) => !isCalendarDate(d) || d <= jakartaDate(), 'Tanggal tidak boleh di masa depan.');

const id = z.coerce.number().int().positive();

const wageSchema = z.object({
  wageDate: pastOrToday.optional(),
  items: z
    .array(
      z.object({
        employeeId: z.number().int().positive(),
        amount: z.number().int('Upah harus bilangan bulat rupiah.').min(1, 'Isi upah minimal Rp 1.').max(50_000_000, 'Upah terlalu besar.'),
        note: z.string().trim().max(200).transform((v) => (v === '' ? null : v)).nullish(),
      }),
    )
    .min(1, 'Pilih minimal satu karyawan.')
    .max(50)
    .refine((items) => new Set(items.map((i) => i.employeeId)).size === items.length, 'Karyawan tidak boleh dobel.'),
  clientRequestId: z.uuid().optional(),
});

// Tampilan "Upah hari ini" untuk satu tanggal (kosong = hari ini menurut server).
router.get('/', async (req, res) => {
  const { date } = z.object({ date: pastOrToday.optional() }).parse(req.query);
  res.json(await getWageDay(date, req.user));
});

router.post('/', async (req, res) => {
  const result = await createWages(wageSchema.parse(req.body), req.user);
  res.status(result.duplicate ? 200 : 201).json(result);
});

// Riwayat slip pada periode terpilih (harian/mingguan/bulanan), boleh disaring per karyawan.
router.get('/slips', async (req, res) => {
  const { period, date } = periodQuery.parse(req.query);
  const { employeeId } = z.object({ employeeId: id.optional() }).parse(req.query);
  const range = resolvePeriod(period, date ?? jakartaDate(), jakartaDate());
  const list = await listSlips({ from: range.from, to: range.to, employeeId }, req.user);
  res.json({ period, range: { from: range.from, to: range.to }, today: jakartaDate(), prevDate: range.prevDate, nextDate: range.nextDate, includesToday: range.includesToday, ...list });
});

router.get('/slips/:id', async (req, res) => {
  res.json({ slip: await getSlip(id.parse(req.params.id), req.user) });
});

router.patch('/slips/:id', async (req, res) => {
  z.object({ voided: z.literal(true) }).parse(req.body);
  await voidSlip(id.parse(req.params.id), req.user);
  res.json({ ok: true });
});

export default router;

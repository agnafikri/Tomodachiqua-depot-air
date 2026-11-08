import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.mjs';
import { createOrder, listOrders, priceFor, voidOrder } from '../services/orders.mjs';
import { MAX_QTY } from '../services/pricing.mjs';

const router = Router();
router.use(requireAuth);

const orderInput = {
  customerId: z.number().int().positive().nullable(), // null = pelanggan umum
  qty: z.number().int('Jumlah galon harus bilangan bulat.').min(1, 'Minimal 1 galon.').max(MAX_QTY, `Maksimal ${MAX_QTY} galon.`),
  isDelivered: z.boolean(),
};

const previewSchema = z.object(orderInput);

const createSchema = z.object({
  ...orderInput,
  payStatus: z.enum(['PAID', 'DEBT']),
  note: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v === '' ? null : v))
    .nullish(),
  clientRequestId: z.uuid().optional(),
});

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD.');
const listSchema = z.object({
  from: date.optional(),
  to: date.optional(),
  customerId: z.coerce.number().int().positive().optional(),
});

// Hitung harga tanpa menyimpan; layar order memakai ini agar aturan harga tetap satu tempat.
router.post('/preview', async (req, res) => {
  const input = previewSchema.parse(req.body);
  res.json({ price: await priceFor(input) });
});

router.post('/', async (req, res) => {
  const input = createSchema.parse(req.body);
  const { order, duplicate } = await createOrder(input, req.user);
  res.status(duplicate ? 200 : 201).json({ order, duplicate });
});

router.get('/', async (req, res) => {
  const filter = listSchema.parse(req.query);
  if (filter.from && filter.to && filter.from > filter.to) {
    return res.status(400).json({ error: { code: 'INVALID_RANGE', message: 'Tanggal awal harus sebelum tanggal akhir.' } });
  }
  res.json(await listOrders(filter));
});

const patchSchema = z.object({ voided: z.literal(true) });

router.patch('/:id', async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  patchSchema.parse(req.body);
  res.json({ order: await voidOrder(id, req.user) });
});

export default router;

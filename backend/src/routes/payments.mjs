import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.mjs';
import { recordPayment, voidPaymentBatch } from '../services/debts.mjs';

const router = Router();
router.use(requireAuth);

// Tepat salah satu: customerId (alokasi ke order tertua dulu) atau orderId (satu order, mis. utang Umum).
const paymentSchema = z
  .object({
    customerId: z.number().int().positive().optional(),
    orderId: z.number().int().positive().optional(),
    amount: z.number().int('Jumlah harus bilangan bulat rupiah.').min(1, 'Jumlah minimal Rp 1.').max(1_000_000_000, 'Jumlah terlalu besar.'),
    clientRequestId: z.uuid().optional(),
  })
  .superRefine((d, ctx) => {
    if ((d.customerId == null) === (d.orderId == null)) {
      ctx.addIssue({ code: 'custom', path: ['customerId'], message: 'Pilih pelanggan atau order, salah satu.' });
    }
  });

router.post('/', async (req, res) => {
  const input = paymentSchema.parse(req.body);
  const result = await recordPayment(input, req.user);
  res.status(result.duplicate ? 200 : 201).json({ payment: result });
});

router.patch('/:batchId', async (req, res) => {
  const batchId = z.uuid().parse(req.params.batchId);
  z.object({ voided: z.literal(true) }).parse(req.body);
  await voidPaymentBatch(batchId, req.user);
  res.json({ ok: true });
});

export default router;

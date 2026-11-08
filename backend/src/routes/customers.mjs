import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.mjs';
import { createCustomer, listCustomers, updateCustomer } from '../services/customers.mjs';

const router = Router();
router.use(requireAuth);

const text = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable();

const price = z.number().int('Harga harus bilangan bulat rupiah.').min(1, 'Harga minimal Rp 1.').max(1_000_000, 'Harga terlalu besar.');
const bundleNum = z.number().int().min(1).max(1000);

const fields = {
  name: z.string().trim().min(1, 'Nama wajib diisi.').max(100, 'Nama terlalu panjang.'),
  phone: text(30),
  address: text(300),
  customPrice: price.nullable(),
  bundleBuy: bundleNum.nullable(),
  bundlePay: bundleNum.nullable(),
};

// Diskon paket: dua angka terisi bersamaan, "bayar" lebih kecil dari "beli".
function checkBundle(data, ctx) {
  const { bundleBuy, bundlePay } = data;
  const hasBuy = bundleBuy != null;
  const hasPay = bundlePay != null;
  if (hasBuy !== hasPay) {
    ctx.addIssue({ code: 'custom', path: [hasBuy ? 'bundlePay' : 'bundleBuy'], message: 'Isi jumlah beli dan jumlah bayar.' });
  } else if (hasBuy && bundlePay >= bundleBuy) {
    ctx.addIssue({ code: 'custom', path: ['bundlePay'], message: 'Jumlah bayar harus lebih kecil dari jumlah beli.' });
  }
}

const createSchema = z
  .object({
    ...fields,
    phone: fields.phone.optional(),
    address: fields.address.optional(),
    customPrice: fields.customPrice.optional(),
    bundleBuy: fields.bundleBuy.optional(),
    bundlePay: fields.bundlePay.optional(),
  })
  .superRefine(checkBundle);

const updateSchema = z
  .object({
    name: fields.name.optional(),
    phone: fields.phone.optional(),
    address: fields.address.optional(),
    customPrice: fields.customPrice.optional(),
    bundleBuy: fields.bundleBuy.optional(),
    bundlePay: fields.bundlePay.optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    // Diskon paket diganti sepasang: kirim keduanya (angka atau null untuk menghapus).
    if ((data.bundleBuy === undefined) !== (data.bundlePay === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['bundleBuy'], message: 'Kirim jumlah beli dan bayar bersamaan.' });
      return;
    }
    if (data.bundleBuy !== undefined) checkBundle(data, ctx);
  });

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  active: z.enum(['true', 'false', 'all']).default('true'),
});

router.get('/', async (req, res) => {
  const { q, active } = querySchema.parse(req.query);
  const customers = await listCustomers({ q, active: active === 'all' ? 'all' : active === 'true' });
  res.json({ customers });
});

router.post('/', async (req, res) => {
  const data = createSchema.parse(req.body);
  res.status(201).json({ customer: await createCustomer(data) });
});

router.patch('/:id', async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const data = updateSchema.parse(req.body);
  res.json({ customer: await updateCustomer(id, data) });
});

export default router;

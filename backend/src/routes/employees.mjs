import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.mjs';
import { createEmployee, listEmployees, updateEmployee } from '../services/employees.mjs';

const router = Router();
router.use(requireAuth);

const phone = z.string().trim().max(30).transform((v) => (v === '' ? null : v)).nullable();
const name = z.string().trim().min(1, 'Nama wajib diisi.').max(100, 'Nama terlalu panjang.');

router.get('/', async (req, res) => {
  const { active } = z.object({ active: z.enum(['true', 'false', 'all']).default('all') }).parse(req.query);
  res.json({ employees: await listEmployees({ active: active === 'all' ? 'all' : active === 'true' }) });
});

router.post('/', async (req, res) => {
  const data = z.object({ name, phone: phone.optional() }).parse(req.body);
  res.status(201).json({ employee: await createEmployee(data) });
});

router.patch('/:id', async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const data = z.object({ name: name.optional(), phone: phone.optional(), isActive: z.boolean().optional() }).parse(req.body);
  res.json({ employee: await updateEmployee(id, data) });
});

export default router;

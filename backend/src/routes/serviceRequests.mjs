import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.mjs';
import { requireRole } from '../middleware/requireRole.mjs';
import { STATUSES, deleteRequest, listRequests, updateRequest } from '../services/serviceRequests.mjs';

// Permintaan layanan di aplikasi: ADMIN dan PEMILIK boleh melihat dan menindaklanjuti.
const router = Router();
router.use(requireAuth);

const id = z.coerce.number().int().positive();
const statusEnum = z.enum(Object.keys(STATUSES));

router.get('/', async (req, res) => {
  const { status } = z.object({ status: statusEnum.optional() }).parse(req.query);
  res.json(await listRequests({ status }));
});

router.patch('/:id', async (req, res) => {
  const data = z
    .object({
      status: statusEnum.optional(),
      internalNote: z.string().trim().max(1000, 'Catatan terlalu panjang.').transform((v) => (v === '' ? null : v)).nullable().optional(),
    })
    .parse(req.body);
  res.json({ request: await updateRequest(id.parse(req.params.id), data, req.user) });
});

// Hapus permanen: khusus ADMIN.
router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  await deleteRequest(id.parse(req.params.id));
  res.json({ ok: true });
});

export default router;

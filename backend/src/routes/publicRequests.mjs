import { createHash } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env.mjs';
import { normalizePhone } from '../services/phone.mjs';
import { AREAS, SERVICE_TYPES, createRequest } from '../services/serviceRequests.mjs';

// Endpoint PUBLIK (tanpa login) untuk formulir di landing page.
const optionalText = (max, label) =>
  z.string().trim().max(max, `${label} terlalu panjang (maksimal ${max} karakter).`).transform((v) => (v === '' ? null : v)).nullish();

const schema = z.object({
  name: z.string().trim().min(2, 'Isi nama (minimal 2 huruf).').max(100, 'Nama terlalu panjang.'),
  phone: z
    .string({ error: 'Isi nomor WhatsApp.' })
    .transform((v, ctx) => {
      const n = normalizePhone(v);
      if (!n) ctx.addIssue({ code: 'custom', message: 'Isi nomor WhatsApp yang aktif, mis. 0812 3456 7890.' });
      return n;
    }),
  area: z.enum(Object.keys(AREAS), { error: 'Pilih area.' }),
  serviceType: z.enum(Object.keys(SERVICE_TYPES), { error: 'Pilih jenis layanan.' }),
  address: optionalText(300, 'Alamat'),
  message: optionalText(1000, 'Keterangan'),
  clientRequestId: z.uuid().optional(),
  website: z.string().max(200).optional(), // kolom jebakan untuk bot: manusia tidak melihatnya
});

export function publicRequestsRouter({ max = 5 } = {}) {
  const router = Router();

  // Batas kiriman per alamat IP.
  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Terlalu banyak permintaan dari perangkat ini. Silakan hubungi kami lewat WhatsApp.' } },
  });

  router.post('/service-requests', limiter, async (req, res) => {
    const data = schema.parse(req.body);
    // Bot yang mengisi kolom jebakan: pura-pura berhasil, tidak disimpan.
    if (data.website) return res.status(201).json({ ok: true });
    const ipHash = createHash('sha256').update(`${req.ip}|${env.JWT_SECRET}`).digest('hex').slice(0, 16);
    await createRequest(data, ipHash);
    return res.status(201).json({ ok: true });
  });

  return router;
}

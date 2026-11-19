import { normalizePhone } from './phone.mjs';

// Tautan wa.me dengan pesan yang sudah terisi. Tanpa nomor valid: membuka WhatsApp tanpa tujuan.
export function waLink(phone, text) {
  const n = normalizePhone(phone);
  const q = text ? `?text=${encodeURIComponent(text)}` : '';
  return n ? `https://wa.me/${n}${q}` : `https://wa.me/${q}`;
}

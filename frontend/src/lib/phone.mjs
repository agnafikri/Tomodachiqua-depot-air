// Nomor WhatsApp Indonesia -> 628xxxxxxxxxx (tanpa plus). Null bila bukan nomor seluler.
// Aturannya sama dengan backend (services/phone.mjs); dipakai landing page dan aplikasi.
export function normalizePhone(raw) {
  let d = String(raw ?? '').replace(/[\s().-]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith('0')) d = `62${d.slice(1)}`;
  else if (d.startsWith('8')) d = `62${d}`;
  return /^628\d{8,12}$/.test(d) ? d : null;
}

// Pembacaan nilai sel Excel menjadi nilai biasa. Fungsi murni (tanpa database), mudah diuji.
// Setiap fungsi parse mengembalikan { ok: true, value } atau { ok: false, message }.
import { isCalendarDate } from '../dates.mjs';

const ok = (value) => ({ ok: true, value });
const bad = (message) => ({ ok: false, message });
const isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
export { isBlank };

// Nilai sel ExcelJS bisa berupa string, angka, Date, boolean, atau objek (rumus, teks kaya, tautan).
export function cellValue(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object' && !(raw instanceof Date)) {
    if ('result' in raw) return cellValue(raw.result); // rumus: pakai hasilnya
    if (Array.isArray(raw.richText)) return raw.richText.map((r) => r.text).join('');
    if ('text' in raw) return cellValue(raw.text);
    if ('error' in raw) return null;
    return String(raw);
  }
  if (typeof raw === 'string') return raw.trim();
  return raw;
}

export const text = (raw, { max = 200 } = {}) => {
  const v = cellValue(raw);
  if (isBlank(v)) return ok(null);
  const s = String(v).trim();
  return s.length > max ? bad(`Terlalu panjang (maksimal ${max} karakter).`) : ok(s);
};

// Uang/angka bulat: 4500, "4500", "4.500", "Rp 4.500". Desimal ditolak.
export function integer(raw) {
  const v = cellValue(raw);
  if (isBlank(v)) return ok(null);
  if (typeof v === 'number') {
    return Number.isInteger(v) ? ok(v) : bad('Harus bilangan bulat tanpa desimal.');
  }
  const s = String(v).trim().replace(/^rp\.?\s*/i, '').replace(/\./g, '').replace(/\s/g, '');
  if (/^\d+$/.test(s)) return ok(Number.parseInt(s, 10));
  return bad('Harus berupa angka bulat (mis. 4500 atau 4.500).');
}

const pad = (n) => String(n).padStart(2, '0');

// Tanggal: sel tanggal Excel, serial angka, "YYYY-MM-DD", atau "DD/MM/YYYY" (hari lebih dulu).
export function date(raw) {
  const v = cellValue(raw);
  if (isBlank(v)) return ok(null);
  let iso = null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return bad('Tanggal tidak valid.');
    iso = v.toISOString().slice(0, 10);
  } else if (typeof v === 'number') {
    iso = new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  } else {
    const s = String(v).trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) iso = s;
    else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) iso = `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  }
  if (!iso || !isCalendarDate(iso)) return bad('Tanggal tidak valid. Pakai format 2026-11-08 atau 08/11/2026.');
  return ok(iso);
}

// Jam: sel jam Excel, pecahan hari, "HH:MM", atau "HH.MM".
export function time(raw) {
  const v = cellValue(raw);
  if (isBlank(v)) return ok(null);
  let h;
  let mi;
  if (v instanceof Date) {
    h = v.getUTCHours();
    mi = v.getUTCMinutes();
  } else if (typeof v === 'number' && v >= 0 && v < 1) {
    const total = Math.round(v * 24 * 60);
    h = Math.floor(total / 60);
    mi = total % 60;
  } else {
    const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(v).trim());
    if (!m) return bad('Jam tidak valid. Pakai format 14:30.');
    h = Number(m[1]);
    mi = Number(m[2]);
  }
  if (h > 23 || mi > 59) return bad('Jam tidak valid. Pakai format 14:30.');
  return ok(`${pad(h)}:${pad(mi)}`);
}

// Ya/Tidak. Kosong = undefined (pemanggil menentukan bawaan atau wajib).
export function yesNo(raw) {
  const v = cellValue(raw);
  if (isBlank(v)) return ok(undefined);
  if (typeof v === 'boolean') return ok(v);
  const s = String(v).trim().toLowerCase();
  if (['ya', 'y', 'iya', 'yes', 'true', '1'].includes(s)) return ok(true);
  if (['tidak', 't', 'no', 'n', 'false', '0'].includes(s)) return ok(false);
  return bad('Isi Ya atau Tidak.');
}

// Judul kolom: tidak peka huruf besar-kecil dan spasi berlebih.
export const normalizeHeader = (raw) => String(cellValue(raw) ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

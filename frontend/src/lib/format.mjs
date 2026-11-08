// Uang selalu integer rupiah; zona waktu tampilan Asia/Jakarta.
const rupiah = new Intl.NumberFormat('id-ID');

export function formatRupiah(amount) {
  const n = Math.trunc(Number(amount) || 0);
  return `${n < 0 ? '-' : ''}Rp ${rupiah.format(Math.abs(n))}`;
}

export function formatDate(value, options = { day: 'numeric', month: 'long', year: 'numeric' }) {
  return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', ...options }).format(new Date(value));
}

export function formatDateTime(value) {
  return formatDate(value, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Tanggal hari ini di Jakarta dalam format YYYY-MM-DD (untuk input tanggal dan filter API).
export function todayJakarta() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function formatTime(value) {
  return formatDate(value, { hour: '2-digit', minute: '2-digit' });
}

// Hanya digit; dipakai untuk kolom angka (harga, jumlah).
export function digitsOnly(value) {
  return String(value).replace(/\D/g, '');
}

// ID unik untuk mencegah order ganda saat tombol terketuk dua kali atau dikirim ulang.
export function newRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

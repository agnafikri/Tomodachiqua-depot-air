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

// Satu-satunya sumber "sekarang" dan "hari ini" untuk logika bisnis.
// Memakai jam mesin tempat backend berjalan (di produksi: server hosting, tidak bisa diubah pengguna).
// Tanggal selalu dihitung di zona Asia/Jakarta. Tes bisa memajukan jam lewat setClock().
const realClock = () => new Date();
let source = realClock;

export function now() {
  return source();
}

// Hanya untuk tes: setClock(() => new Date('2026-11-08T01:00:00+07:00')); setClock() untuk mengembalikan.
export function setClock(fn) {
  source = fn ?? realClock;
}

export function jakartaDate(date = now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// Waktu kejadian untuk catatan yang bertanggal (mis. air masuk tanggal X):
// hari ini = sekarang; tanggal lampau = pukul 12.00 WIB pada tanggal itu.
export function atDate(dateStr, date = now()) {
  return dateStr === jakartaDate(date) ? date : new Date(`${dateStr}T12:00:00+07:00`);
}

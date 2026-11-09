// Pemeriksaan tanggal kalender 'YYYY-MM-DD'. Tidak pernah melempar galat.
// (new Date('2031-02-30') di JavaScript "bergulir" jadi 2 Maret, jadi harus dicocokkan balik.)
export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === value;
}

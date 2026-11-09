// Perhitungan periode laporan (harian, mingguan, bulanan). Fungsi murni; tanggal berupa 'YYYY-MM-DD'
// (tanggal kalender Jakarta). Perhitungan memakai UTC murni agar tidak terpengaruh zona waktu mesin.
// Minggu dimulai hari Senin.
export const PERIODS = ['daily', 'weekly', 'monthly'];

const toDate = (s) => new Date(`${s}T00:00:00Z`);
const fmt = (d) => d.toISOString().slice(0, 10);

export function addDays(s, n) {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

function startOfMonth(s) {
  return `${s.slice(0, 7)}-01`;
}

function addMonths(firstOfMonth, n) {
  const d = toDate(firstOfMonth);
  d.setUTCMonth(d.getUTCMonth() + n, 1);
  return fmt(d);
}

// Hari-hari dari 'from' sampai 'to' (inklusif).
export function eachDay(from, to) {
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

// today = hari ini menurut jam server. prevDate/nextDate = tanggal yang dipakai tombol geser
// (nextDate null bila periode berikutnya belum dimulai).
export function resolvePeriod(period, date, today) {
  let from;
  let to;
  let prevDate;
  let nextDate;

  if (period === 'daily') {
    from = date;
    to = date;
    prevDate = addDays(date, -1);
    nextDate = addDays(date, 1);
  } else if (period === 'weekly') {
    const dow = (toDate(date).getUTCDay() + 6) % 7; // Senin = 0
    from = addDays(date, -dow);
    to = addDays(from, 6);
    prevDate = addDays(from, -7);
    nextDate = addDays(from, 7);
  } else if (period === 'monthly') {
    from = startOfMonth(date);
    to = addDays(addMonths(from, 1), -1);
    prevDate = addMonths(from, -1);
    nextDate = addMonths(from, 1);
  } else {
    throw new Error(`Periode tidak dikenal: ${period}`);
  }

  return {
    period,
    from,
    to,
    prevDate,
    nextDate: nextDate > today ? null : nextDate,
    includesToday: from <= today && today <= to,
  };
}

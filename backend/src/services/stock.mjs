// SATU-SATUNYA tempat logika stok toren.
//
// Sisa liter = koreksi terakhir (liters_after)
//            + air masuk sesudah koreksi
//            - (galon order + konsumsi pribadi sesudah koreksi) x liter per galon.
// Galon order = jumlah fisik (qty), termasuk galon gratis dari diskon paket.
// Order/air masuk/konsumsi yang dibatalkan tidak dihitung.
// Perkiraan habis = sisa / rata-rata pemakaian harian (jendela 7 hari, atau lebih pendek bila data baru).
import { query } from '../db/pool.mjs';
import { jakartaDate, now } from './clock.mjs';
import { getTankSettings } from './settings.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
export const WINDOW_DAYS = 7;
export const LOW_DAYS = 3; // oranye bila perkiraan habis < 3 hari
export const CRITICAL_DAYS = 1; // merah bila < 1 hari

const round1 = (n) => Math.round(n * 10) / 10;

// Fungsi murni (tanpa database). Semua masukan sudah berupa angka/tanggal.
export function calculateStock({
  capacityLiters,
  litersPerGallon,
  adjustment, // { litersAfter, adjustedAt: Date } | null
  refillLitersSince = 0, // air masuk sesudah koreksi
  gallonsSince = 0, // galon terpakai sesudah koreksi (order + pribadi)
  recentGallons = 0, // galon terpakai dalam WINDOW_DAYS terakhir
  firstUsageAt = null, // pemakaian pertama yang tercatat (Date) | null
  at = new Date(),
}) {
  const base = { capacityLiters, litersPerGallon };
  if (!adjustment) {
    return { ...base, known: false, status: 'NEEDS_ADJUSTMENT', level: 'UNKNOWN' };
  }

  const remainingLiters = adjustment.litersAfter + refillLitersSince - gallonsSince * litersPerGallon;
  const usable = Math.max(remainingLiters, 0);

  let avgDailyGallons = null;
  if (firstUsageAt) {
    const windowStart = Math.max(firstUsageAt.getTime(), at.getTime() - WINDOW_DAYS * DAY_MS);
    const days = Math.max(1, (at.getTime() - windowStart) / DAY_MS);
    avgDailyGallons = recentGallons / days;
  }
  const avgDailyLiters = avgDailyGallons ? avgDailyGallons * litersPerGallon : null;
  const daysLeft = avgDailyLiters ? usable / avgDailyLiters : null;

  const status = remainingLiters < 0 ? 'NEGATIVE' : remainingLiters > capacityLiters ? 'OVER_CAPACITY' : 'OK';
  let level = 'OK';
  if (remainingLiters <= 0 || (daysLeft != null && daysLeft < CRITICAL_DAYS)) level = 'CRITICAL';
  else if (daysLeft != null && daysLeft < LOW_DAYS) level = 'LOW';

  return {
    ...base,
    known: true,
    status,
    level,
    remainingLiters,
    percent: Math.min(100, Math.max(0, Math.round((remainingLiters / capacityLiters) * 100))),
    gallonsLeft: Math.floor(usable / litersPerGallon),
    avgDailyGallons: avgDailyGallons == null ? null : round1(avgDailyGallons),
    daysLeft: daysLeft == null ? null : round1(daysLeft),
    emptyOn: daysLeft == null ? null : jakartaDate(new Date(at.getTime() + daysLeft * DAY_MS)),
    adjustedAt: adjustment.adjustedAt,
    litersAfterAdjustment: adjustment.litersAfter,
    refillLitersSince,
    gallonsSince,
  };
}

// Mengambil angka dari database lalu memakai calculateStock.
export async function getTankStatus(db = { query }) {
  const at = now();
  const { capacityLiters, litersPerGallon } = await getTankSettings(db);

  const adjRow = (
    await db.query('SELECT liters_after, adjusted_at FROM tank_adjustments ORDER BY adjusted_at DESC, id DESC LIMIT 1')
  ).rows[0];
  const adjustment = adjRow ? { litersAfter: adjRow.liters_after, adjustedAt: adjRow.adjusted_at } : null;

  const windowStart = new Date(at.getTime() - WINDOW_DAYS * DAY_MS);
  const gallonsAfter = (since) =>
    db.query(
      `SELECT (SELECT COALESCE(SUM(qty), 0) FROM orders WHERE voided_at IS NULL AND ordered_at > $1 AND ordered_at <= $2)::int
            + (SELECT COALESCE(SUM(gallons), 0) FROM personal_use WHERE voided_at IS NULL AND occurred_at > $1 AND occurred_at <= $2)::int AS g`,
      [since, at],
    );

  let refillLitersSince = 0;
  let gallonsSince = 0;
  if (adjustment) {
    refillLitersSince = (
      await db.query(
        'SELECT COALESCE(SUM(liters), 0)::int AS l FROM tank_refills WHERE voided_at IS NULL AND occurred_at > $1 AND occurred_at <= $2',
        [adjustment.adjustedAt, at],
      )
    ).rows[0].l;
    gallonsSince = (await gallonsAfter(adjustment.adjustedAt)).rows[0].g;
  }
  const recentGallons = (await gallonsAfter(windowStart)).rows[0].g;
  const firstUsageAt = (
    await db.query(
      `SELECT LEAST((SELECT MIN(ordered_at) FROM orders WHERE voided_at IS NULL),
                    (SELECT MIN(occurred_at) FROM personal_use WHERE voided_at IS NULL)) AS first_at`,
    )
  ).rows[0].first_at;

  return {
    today: jakartaDate(at),
    ...calculateStock({ capacityLiters, litersPerGallon, adjustment, refillLitersSince, gallonsSince, recentGallons, firstUsageAt, at }),
  };
}

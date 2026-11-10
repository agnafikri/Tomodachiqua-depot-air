// Laporan (galon, penjualan, uang masuk, utang) dan ringkasan keuangan untuk satu periode.
// Semua hari dihitung di zona Asia/Jakarta mengikuti jam server; data yang dibatalkan tidak dihitung.
//
// Definisi:
//  - Nilai penjualan = total semua order periode itu (termasuk yang masih utang).
//  - Uang masuk      = pembayaran yang benar-benar diterima pada periode itu (payments.paid_at).
//                      Terbagi: dibayar saat order (batch_id kosong) dan pembayaran utang.
//  - Utang baru      = bagian order periode itu yang belum dibayar saat order dibuat.
//  - Pelunasan       = pembayaran utang yang masuk pada periode itu (termasuk untuk order periode lalu).
//  - Keringanan      = sisa utang yang dianggap lunas (BUKAN uang masuk).
//  - Pengeluaran     = pengeluaran manual + upah harian (slip) pada periode itu.
//  - Saldo           = uang masuk - pengeluaran pada periode itu (belum ada saldo awal/kas kumulatif).
import { query } from '../db/pool.mjs';
import { jakartaDate } from './clock.mjs';
import { MANUAL_CATEGORIES, categoryLabel } from './expenseCategories.mjs';
import { eachDay, resolvePeriod } from './period.mjs';

const TZ = 'Asia/Jakarta';
// Rentang hari [from, to] inklusif untuk kolom timestamp; parameter $1 = from, $2 = to.
const inRange = (col) =>
  `${col} >= ($1::date)::timestamp AT TIME ZONE '${TZ}' AND ${col} < ($2::date + 1)::timestamp AT TIME ZONE '${TZ}'`;
const dayOf = (col) => `to_char(${col} AT TIME ZONE '${TZ}', 'YYYY-MM-DD')`;

function periodFor(period, date) {
  const today = jakartaDate();
  return { today, ...resolvePeriod(period, date ?? today, today) };
}

async function paymentTotals(from, to) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(amount), 0)::int AS total,
            COALESCE(SUM(amount) FILTER (WHERE batch_id IS NULL), 0)::int AS at_order,
            COALESCE(SUM(amount) FILTER (WHERE batch_id IS NOT NULL), 0)::int AS debt_payments
     FROM payments WHERE voided_at IS NULL AND ${inRange('paid_at')}`,
    [from, to],
  );
  return rows[0];
}

async function waivedTotal(from, to) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(amount), 0)::int AS waived FROM debt_waivers WHERE voided_at IS NULL AND ${inRange('created_at')}`,
    [from, to],
  );
  return rows[0].waived;
}

async function wageTotal(from, to) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(amount), 0)::int AS total FROM wage_slips
     WHERE voided_at IS NULL AND wage_date BETWEEN $1::date AND $2::date`,
    [from, to],
  );
  return rows[0].total;
}

// Pengeluaran manual saja (tanpa upah).
async function expenseTotal(from, to) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(amount), 0)::int AS total FROM expenses
     WHERE voided_at IS NULL AND spent_date BETWEEN $1::date AND $2::date`,
    [from, to],
  );
  return rows[0].total;
}

export async function getReport({ period, date }) {
  const p = periodFor(period, date);
  const { from, to, today } = p;
  const args = [from, to];

  const [orders, pay, waived, personal, manualExpenses, wages, ordersByDay, payByDay, expByDay, wageByDay] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS order_count,
              COALESCE(SUM(o.qty), 0)::int AS gallons,
              COALESCE(SUM(o.qty - o.paid_qty), 0)::int AS free_gallons,
              COALESCE(SUM(o.qty) FILTER (WHERE o.is_delivered), 0)::int AS delivered,
              COALESCE(SUM(o.qty) FILTER (WHERE NOT o.is_delivered), 0)::int AS pickup,
              COALESCE(SUM(o.total), 0)::int AS sales,
              COALESCE(SUM(o.total - COALESCE(ap.amount, 0)), 0)::int AS new_debt
       FROM orders o
       LEFT JOIN LATERAL (
         SELECT SUM(amount) AS amount FROM payments WHERE order_id = o.id AND batch_id IS NULL AND voided_at IS NULL
       ) ap ON TRUE
       WHERE o.voided_at IS NULL AND ${inRange('o.ordered_at')}`,
      args,
    ),
    paymentTotals(from, to),
    waivedTotal(from, to),
    query(
      `SELECT COALESCE(SUM(gallons), 0)::int AS gallons FROM personal_use WHERE voided_at IS NULL AND ${inRange('occurred_at')}`,
      args,
    ),
    expenseTotal(from, to),
    wageTotal(from, to),
    query(
      `SELECT ${dayOf('ordered_at')} AS day, COUNT(*)::int AS order_count, SUM(qty)::int AS gallons, SUM(total)::int AS sales
       FROM orders WHERE voided_at IS NULL AND ${inRange('ordered_at')} GROUP BY 1`,
      args,
    ),
    query(
      `SELECT ${dayOf('paid_at')} AS day, SUM(amount)::int AS cash_in
       FROM payments WHERE voided_at IS NULL AND ${inRange('paid_at')} GROUP BY 1`,
      args,
    ),
    query(
      `SELECT spent_date::text AS day, SUM(amount)::int AS amount
       FROM expenses WHERE voided_at IS NULL AND spent_date BETWEEN $1::date AND $2::date GROUP BY 1`,
      args,
    ),
    query(
      `SELECT wage_date::text AS day, SUM(amount)::int AS amount
       FROM wage_slips WHERE voided_at IS NULL AND wage_date BETWEEN $1::date AND $2::date GROUP BY 1`,
      args,
    ),
  ]);

  const expenses = manualExpenses + wages;
  const o = orders.rows[0];
  const byDay = (rows, key) => Object.fromEntries(rows.rows.map((r) => [r.day, r[key] ?? r]));
  const od = Object.fromEntries(ordersByDay.rows.map((r) => [r.day, r]));
  const pd = byDay(payByDay, 'cash_in');
  const ed = byDay(expByDay, 'amount');
  const wd = byDay(wageByDay, 'amount');

  // Rincian per hari hanya sampai hari ini (hari yang belum terjadi tidak ditampilkan).
  const days = eachDay(from, to < today ? to : today).map((d) => ({
    date: d,
    orderCount: od[d]?.order_count ?? 0,
    gallons: od[d]?.gallons ?? 0,
    sales: od[d]?.sales ?? 0,
    cashIn: pd[d] ?? 0,
    expenses: (ed[d] ?? 0) + (wd[d] ?? 0),
  }));

  return {
    period: p.period,
    range: { from, to },
    today,
    prevDate: p.prevDate,
    nextDate: p.nextDate,
    includesToday: p.includesToday,
    totals: {
      orderCount: o.order_count,
      gallons: o.gallons,
      freeGallons: o.free_gallons,
      deliveredGallons: o.delivered,
      pickupGallons: o.pickup,
      sales: o.sales,
      cashIn: pay.total,
      cashInAtOrder: pay.at_order,
      debtPayments: pay.debt_payments,
      newDebt: o.new_debt,
      waived,
      personalGallons: personal.rows[0].gallons,
      wages,
      expenses,
      balance: pay.total - expenses,
    },
    days,
  };
}

export async function getFinance({ period, date }) {
  const p = periodFor(period, date);
  const { from, to, today } = p;

  const [pay, waived, cats, wageRows] = await Promise.all([
    paymentTotals(from, to),
    waivedTotal(from, to),
    query(
      `SELECT category, SUM(amount)::int AS amount, COUNT(*)::int AS count
       FROM expenses WHERE voided_at IS NULL AND spent_date BETWEEN $1::date AND $2::date
       GROUP BY category`,
      [from, to],
    ),
    query(
      `SELECT e.id, e.name, SUM(w.amount)::int AS amount, COUNT(*)::int AS days
       FROM wage_slips w JOIN employees e ON e.id = w.employee_id
       WHERE w.voided_at IS NULL AND w.wage_date BETWEEN $1::date AND $2::date
       GROUP BY e.id, e.name ORDER BY SUM(w.amount) DESC, lower(e.name)`,
      [from, to],
    ),
  ]);

  // Upah dari slip digabung ke kategori "Gaji dan upah" (bersama catatan upah manual lama bila ada).
  const merged = new Map(cats.rows.map((r) => [r.category, { amount: r.amount, count: r.count }]));
  const wagesTotal = wageRows.rows.reduce((s, r) => s + r.amount, 0);
  const slipCount = wageRows.rows.reduce((s, r) => s + r.days, 0);
  if (wagesTotal > 0) {
    const cur = merged.get('UPAH') ?? { amount: 0, count: 0 };
    merged.set('UPAH', { amount: cur.amount + wagesTotal, count: cur.count + slipCount });
  }

  const expenses = [...merged.values()].reduce((s, r) => s + r.amount, 0);
  const byCategory = [...merged.entries()]
    .map(([category, v]) => ({
      category,
      label: categoryLabel(category),
      amount: v.amount,
      count: v.count,
      percent: expenses ? Math.round((v.amount / expenses) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));

  return {
    period: p.period,
    range: { from, to },
    today,
    prevDate: p.prevDate,
    nextDate: p.nextDate,
    includesToday: p.includesToday,
    income: { total: pay.total, atOrder: pay.at_order, debtPayments: pay.debt_payments },
    waived,
    expenses: { total: expenses, byCategory },
    // Rekap hasil penjumlahan slip harian per karyawan (bukan gaji bulanan).
    wages: {
      total: wagesTotal,
      byEmployee: wageRows.rows.map((r) => ({ employeeId: Number(r.id), name: r.name, amount: r.amount, days: r.days })),
    },
    balance: pay.total - expenses,
    categories: MANUAL_CATEGORIES,
  };
}

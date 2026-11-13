// Pembuatan berkas Excel: laporan satu periode dan cadangan lengkap.
// Uang berupa angka (bisa dijumlah), tanggal berupa tanggal sungguhan, baris total memakai rumus SUM.
import ExcelJS from 'exceljs';
import { query } from '../../db/pool.mjs';
import { jakartaDate, now } from '../clock.mjs';
import { listDebts } from '../debts.mjs';
import { categoryLabel } from '../expenseCategories.mjs';
import { resolvePeriod } from '../period.mjs';
import { getFinance, getReport } from '../reports.mjs';

const TZ = 'Asia/Jakarta';
const FMT_MONEY = '#,##0';
const FMT_DATE = 'dd/mm/yyyy';
const BLUE = 'FF0B5FA5';

const toDate = (s) => (s ? new Date(`${s}T00:00:00Z`) : null); // sel tanggal Excel dibaca sebagai UTC
const localDate = (col) => `to_char(${col} AT TIME ZONE '${TZ}', 'YYYY-MM-DD')`;
const localTime = (col) => `to_char(${col} AT TIME ZONE '${TZ}', 'HH24:MI')`;
const localStamp = (col) => `to_char(${col} AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI')`;
const inRange = (col) => `${col} >= ($1::date)::timestamp AT TIME ZONE '${TZ}' AND ${col} < ($2::date + 1)::timestamp AT TIME ZONE '${TZ}'`;

// ---------- pembantu lembar ----------

function styleHeader(ws, count) {
  const row = ws.getRow(1);
  row.height = 22;
  for (let i = 1; i <= count; i += 1) {
    const c = row.getCell(i);
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    c.alignment = { vertical: 'middle' };
  }
}

// columns: [{ header, key, width, type: 'money'|'date'|'int'|'text' }]
function addTable(wb, name, columns, rows, { totals = [] } = {}) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? (c.type === 'money' ? 14 : c.type === 'date' ? 12 : 18),
    style: c.type === 'money' ? { numFmt: FMT_MONEY } : c.type === 'date' ? { numFmt: FMT_DATE } : {},
  }));
  styleHeader(ws, columns.length);
  for (const r of rows) {
    ws.addRow(Object.fromEntries(columns.map((c) => [c.key, c.type === 'date' ? toDate(r[c.key]) : (r[c.key] ?? null)])));
  }
  if (rows.length && totals.length) {
    const rowObj = { [columns[0].key]: 'Total' };
    const totalRow = ws.addRow(rowObj);
    totalRow.font = { bold: true };
    for (const key of totals) {
      const idx = columns.findIndex((c) => c.key === key) + 1;
      const letter = ws.getColumn(idx).letter;
      totalRow.getCell(idx).value = { formula: `SUM(${letter}2:${letter}${rows.length + 1})`, result: rows.reduce((s, r) => s + (Number(r[key]) || 0), 0) };
      totalRow.getCell(idx).numFmt = FMT_MONEY;
    }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

// ---------- data ----------

const statusOf = (total, paid, waived) => (paid + waived >= total ? 'Lunas' : paid + waived > 0 ? 'Sebagian' : 'Utang');

async function fetchOrders(range) {
  const where = range ? `WHERE o.voided_at IS NULL AND ${inRange('o.ordered_at')}` : '';
  const { rows } = await query(
    `SELECT o.id, ${localDate('o.ordered_at')} AS d, ${localTime('o.ordered_at')} AS t, c.name AS customer, o.qty, (o.qty - o.paid_qty) AS free,
            o.is_delivered, o.unit_price, o.total, COALESCE(p.paid, 0)::int AS paid, COALESCE(w.waived, 0)::int AS waived,
            o.note, u.name AS by_name, ${localStamp('o.voided_at')} AS voided
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     JOIN users u ON u.id = o.created_by
     LEFT JOIN LATERAL (SELECT SUM(amount) AS paid FROM payments WHERE order_id = o.id AND voided_at IS NULL) p ON TRUE
     LEFT JOIN LATERAL (SELECT SUM(amount) AS waived FROM debt_waivers WHERE order_id = o.id AND voided_at IS NULL) w ON TRUE
     ${where} ORDER BY o.ordered_at, o.id`,
    range ? [range.from, range.to] : [],
  );
  return rows.map((r) => ({
    id: Number(r.id), date: r.d, time: r.t, customer: r.customer ?? 'Umum', qty: r.qty, free: r.free,
    delivery: r.is_delivered ? 'Diantar' : 'Diambil', unitPrice: r.unit_price, total: r.total, paid: r.paid, waived: r.waived,
    outstanding: r.voided ? 0 : Math.max(r.total - r.paid - r.waived, 0),
    status: r.voided ? 'Dibatalkan' : statusOf(r.total, r.paid, r.waived), note: r.note, by: r.by_name, voided: r.voided,
  }));
}

async function fetchPayments(range) {
  const where = range ? `WHERE p.voided_at IS NULL AND ${inRange('p.paid_at')}` : '';
  const { rows } = await query(
    `SELECT p.id, ${localDate('p.paid_at')} AS d, ${localTime('p.paid_at')} AS t, c.name AS customer, p.order_id, (p.batch_id IS NULL) AS at_order,
            p.amount, u.name AS by_name, ${localStamp('p.voided_at')} AS voided
     FROM payments p LEFT JOIN customers c ON c.id = p.customer_id JOIN users u ON u.id = p.created_by
     ${where} ORDER BY p.paid_at, p.id`,
    range ? [range.from, range.to] : [],
  );
  return rows.map((r) => ({ id: Number(r.id), date: r.d, time: r.t, customer: r.customer ?? 'Umum', orderId: Number(r.order_id), kind: r.at_order ? 'Saat order' : 'Pelunasan utang', amount: r.amount, by: r.by_name, voided: r.voided }));
}

async function fetchWaivers(range) {
  const where = range ? `WHERE w.voided_at IS NULL AND ${inRange('w.created_at')}` : '';
  const { rows } = await query(
    `SELECT w.id, ${localDate('w.created_at')} AS d, c.name AS customer, w.order_id, w.amount, w.note, u.name AS by_name, ${localStamp('w.voided_at')} AS voided
     FROM debt_waivers w LEFT JOIN customers c ON c.id = w.customer_id JOIN users u ON u.id = w.created_by
     ${where} ORDER BY w.created_at, w.id`,
    range ? [range.from, range.to] : [],
  );
  return rows.map((r) => ({ id: Number(r.id), date: r.d, customer: r.customer ?? 'Umum', orderId: Number(r.order_id), amount: r.amount, note: r.note, by: r.by_name, voided: r.voided }));
}

async function fetchExpenses(range) {
  const where = range ? 'WHERE e.voided_at IS NULL AND e.spent_date BETWEEN $1::date AND $2::date' : '';
  const { rows } = await query(
    `SELECT e.id, e.spent_date::text AS d, e.category, e.amount, e.note, u.name AS by_name, ${localStamp('e.voided_at')} AS voided
     FROM expenses e JOIN users u ON u.id = e.created_by ${where} ORDER BY e.spent_date, e.id`,
    range ? [range.from, range.to] : [],
  );
  return rows.map((r) => ({ id: Number(r.id), date: r.d, category: categoryLabel(r.category), amount: r.amount, note: r.note, by: r.by_name, voided: r.voided }));
}

async function fetchWages(range) {
  const where = range ? 'WHERE w.voided_at IS NULL AND w.wage_date BETWEEN $1::date AND $2::date' : '';
  const { rows } = await query(
    `SELECT w.id, w.wage_date::text AS d, e.name AS employee, w.amount, w.note, u.name AS by_name, ${localStamp('w.voided_at')} AS voided
     FROM wage_slips w JOIN employees e ON e.id = w.employee_id JOIN users u ON u.id = w.created_by ${where} ORDER BY w.wage_date, e.name, w.id`,
    range ? [range.from, range.to] : [],
  );
  return rows.map((r) => ({ id: Number(r.id), date: r.d, employee: r.employee, amount: r.amount, note: r.note, by: r.by_name, voided: r.voided }));
}

const C = {
  money: (header, key, width) => ({ header, key, width, type: 'money' }),
  date: (header, key) => ({ header, key, type: 'date' }),
  text: (header, key, width) => ({ header, key, width }),
  int: (header, key, width) => ({ header, key, width: width ?? 10 }),
};
const orderColumns = (withVoid) => [
  C.date('Tanggal', 'date'), C.text('Jam', 'time', 8), C.text('Pelanggan', 'customer', 28), C.int('Jumlah galon', 'qty', 14), C.int('Galon gratis', 'free', 13),
  C.text('Pengantaran', 'delivery', 13), C.money('Harga satuan', 'unitPrice', 14), C.money('Total', 'total'), C.money('Dibayar', 'paid'), C.money('Keringanan', 'waived'),
  C.money('Sisa utang', 'outstanding'), C.text('Status', 'status', 12), C.text('Catatan', 'note', 30), C.text('Dicatat oleh', 'by', 16),
  ...(withVoid ? [C.text('Dibatalkan pada', 'voided', 18)] : []),
];
const paymentColumns = (withVoid) => [
  C.date('Tanggal', 'date'), C.text('Jam', 'time', 8), C.text('Pelanggan', 'customer', 28), C.text('Jenis', 'kind', 16), C.money('Jumlah', 'amount'), C.text('Dicatat oleh', 'by', 16),
  ...(withVoid ? [C.int('No. order', 'orderId', 10), C.text('Dibatalkan pada', 'voided', 18)] : []),
];

// ---------- laporan periode ----------

const PERIOD_ID = { daily: 'harian', weekly: 'mingguan', monthly: 'bulanan' };
const PERIOD_TITLE = { daily: 'Harian', weekly: 'Mingguan', monthly: 'Bulanan' };

export function reportFileName(period, from, to) {
  const span = period === 'daily' ? from : period === 'weekly' ? `${from}_${to}` : from.slice(0, 7);
  return `laporan-${PERIOD_ID[period]}-${span}.xlsx`;
}

export async function buildPeriodWorkbook({ period, date }) {
  const today = jakartaDate();
  const range = resolvePeriod(period, date ?? today, today);
  const [report, finance, orders, payments, waivers, expenses, wages, debts] = await Promise.all([
    getReport({ period, date }), getFinance({ period, date }),
    fetchOrders(range), fetchPayments(range), fetchWaivers(range), fetchExpenses(range), fetchWages(range), listDebts(),
  ]);
  const t = report.totals;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tomodachiqua Depot';
  wb.created = now();

  // Ringkasan
  const ws = wb.addWorksheet('Ringkasan');
  ws.columns = [{ width: 34 }, { width: 20 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];
  ws.addRow(['Tomodachiqua - Depot Air Isi Ulang']).font = { bold: true, size: 14 };
  ws.addRow([`Laporan ${PERIOD_TITLE[period]}: ${range.from === range.to ? range.from : `${range.from} s.d. ${range.to}`}`]).font = { bold: true };
  ws.addRow([`Dibuat ${jakartaDate()} (zona Asia/Jakarta)`]);
  ws.addRow([]);
  const section = (title) => { const r = ws.addRow([title]); r.font = { bold: true, color: { argb: BLUE } }; };
  const line = (label, value, money = true) => { const r = ws.addRow([label, value]); if (money) r.getCell(2).numFmt = FMT_MONEY; return r; };
  section('Uang');
  line('Uang masuk', t.cashIn); line('  Dibayar saat order', t.cashInAtOrder); line('  Pembayaran utang (pelunasan)', t.debtPayments);
  line('Pengeluaran (termasuk upah)', t.expenses); line('  Termasuk upah harian', t.wages);
  const saldo = line('Saldo (uang masuk - pengeluaran)', t.balance); saldo.font = { bold: true };
  ws.addRow([]);
  section('Penjualan');
  line('Nilai penjualan (termasuk yang masih utang)', t.sales); line('Jumlah order', t.orderCount, false); line('Galon terjual', t.gallons, false);
  line('  Diantar', t.deliveredGallons, false); line('  Diambil', t.pickupGallons, false); line('  Gratis dari paket', t.freeGallons, false);
  line('Konsumsi pribadi (galon)', t.personalGallons, false);
  ws.addRow([]);
  section('Utang');
  line('Utang baru', t.newDebt); line('Pelunasan', t.debtPayments); line('Keringanan (dianggap lunas, bukan uang masuk)', t.waived);
  ws.addRow([]);
  section('Rincian per hari');
  const head = ws.addRow(['Tanggal', 'Jumlah order', 'Galon', 'Penjualan', 'Uang masuk', 'Pengeluaran']);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } }; });
  const first = ws.rowCount + 1;
  for (const d of report.days) {
    const r = ws.addRow([toDate(d.date), d.orderCount, d.gallons, d.sales, d.cashIn, d.expenses]);
    r.getCell(1).numFmt = FMT_DATE;
    for (let c = 4; c <= 6; c += 1) r.getCell(c).numFmt = FMT_MONEY;
  }
  if (report.days.length) {
    const last = ws.rowCount;
    const tot = ws.addRow(['Total']);
    tot.font = { bold: true };
    [['B', 2, 'orderCount'], ['C', 3, 'gallons'], ['D', 4, 'sales'], ['E', 5, 'cashIn'], ['F', 6, 'expenses']].forEach(([letter, idx, key]) => {
      tot.getCell(idx).value = { formula: `SUM(${letter}${first}:${letter}${last})`, result: report.days.reduce((s, d) => s + d[key], 0) };
      if (idx >= 4) tot.getCell(idx).numFmt = FMT_MONEY;
    });
  }
  ws.addRow([]);
  section('Pengeluaran per kategori');
  for (const c of finance.expenses.byCategory) line(c.label, c.amount);

  addTable(wb, 'Order', orderColumns(false), orders, { totals: ['total', 'paid', 'waived', 'outstanding'] });
  addTable(wb, 'Pembayaran', paymentColumns(false), payments, { totals: ['amount'] });
  addTable(wb, 'Keringanan', [C.date('Tanggal', 'date'), C.text('Pelanggan', 'customer', 28), C.money('Jumlah', 'amount'), C.text('Catatan', 'note', 34), C.text('Dicatat oleh', 'by', 16)], waivers, { totals: ['amount'] });
  addTable(wb, 'Pengeluaran', [C.date('Tanggal', 'date'), C.text('Kategori', 'category', 24), C.money('Jumlah', 'amount'), C.text('Catatan', 'note', 34), C.text('Dicatat oleh', 'by', 16)], expenses, { totals: ['amount'] });
  addTable(wb, 'Upah', [C.date('Tanggal', 'date'), C.text('Karyawan', 'employee', 26), C.money('Upah', 'amount'), C.text('Catatan', 'note', 34), C.text('Dicatat oleh', 'by', 16)], wages, { totals: ['amount'] });

  const debtRows = [
    ...debts.customers.map((c) => ({ name: c.name, orders: c.orderCount, since: c.oldestAt ? localDateOf(c.oldestAt) : null, outstanding: c.outstanding })),
    ...debts.umumOrders.map((o) => ({ name: `Umum: ${o.note ?? 'tanpa catatan'}`, orders: 1, since: localDateOf(o.orderedAt), outstanding: o.outstanding })),
  ];
  addTable(wb, 'Utang saat ini', [C.text('Pelanggan', 'name', 36), C.int('Jumlah order', 'orders', 14), C.date('Sejak', 'since'), C.money('Sisa utang', 'outstanding')], debtRows, { totals: ['outstanding'] });
  return { workbook: wb, fileName: reportFileName(period, range.from, range.to) };
}

const localDateOf = (ts) => jakartaDate(new Date(ts));

// ---------- cadangan lengkap ----------

export async function buildBackupWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tomodachiqua Depot';
  wb.created = now();
  const info = wb.addWorksheet('Info'); // dibuat pertama agar menjadi lembar pertama; isinya diisi di akhir

  const [customers, employees, orders, payments, waivers, expenses, wages, refills, adjustments, personal, settings] = await Promise.all([
    query('SELECT name, phone, address, custom_price, bundle_buy, bundle_pay, is_active, created_at::date::text AS d FROM customers ORDER BY lower(name)'),
    query('SELECT name, phone, is_active, created_at::date::text AS d FROM employees ORDER BY lower(name)'),
    fetchOrders(null), fetchPayments(null), fetchWaivers(null), fetchExpenses(null), fetchWages(null),
    query(`SELECT r.refill_date::text AS d, r.liters, r.note, u.name AS by_name, ${localStamp('r.voided_at')} AS voided FROM tank_refills r JOIN users u ON u.id = r.created_by ORDER BY r.refill_date, r.id`),
    query(`SELECT ${localStamp('a.adjusted_at')} AS at, a.liters_after, a.note, u.name AS by_name FROM tank_adjustments a JOIN users u ON u.id = a.created_by ORDER BY a.adjusted_at, a.id`),
    query(`SELECT p.use_date::text AS d, p.gallons, p.note, u.name AS by_name, ${localStamp('p.voided_at')} AS voided FROM personal_use p JOIN users u ON u.id = p.created_by ORDER BY p.use_date, p.id`),
    query('SELECT key, value FROM settings ORDER BY key'),
  ]);

  const counts = {};
  const add = (name, columns, rows, opts) => { counts[name] = rows.length; addTable(wb, name, columns, rows, opts); };

  add('Pelanggan', [C.text('Nama', 'name', 28), C.text('Telepon', 'phone', 18), C.text('Alamat', 'address', 30), C.money('Harga khusus', 'customPrice', 14), C.int('Paket beli', 'bundleBuy', 11), C.int('Paket bayar', 'bundlePay', 12), C.text('Aktif', 'active', 8), C.date('Dibuat', 'created')],
    customers.rows.map((r) => ({ name: r.name, phone: r.phone, address: r.address, customPrice: r.custom_price, bundleBuy: r.bundle_buy, bundlePay: r.bundle_pay, active: r.is_active ? 'Ya' : 'Tidak', created: r.d })));
  add('Karyawan', [C.text('Nama', 'name', 28), C.text('Telepon', 'phone', 18), C.text('Aktif', 'active', 8), C.date('Dibuat', 'created')],
    employees.rows.map((r) => ({ name: r.name, phone: r.phone, active: r.is_active ? 'Ya' : 'Tidak', created: r.d })));
  add('Order', orderColumns(true), orders, { totals: ['total', 'paid', 'waived', 'outstanding'] });
  add('Pembayaran', paymentColumns(true), payments, { totals: ['amount'] });
  add('Keringanan', [C.date('Tanggal', 'date'), C.text('Pelanggan', 'customer', 28), C.int('No. order', 'orderId', 10), C.money('Jumlah', 'amount'), C.text('Catatan', 'note', 34), C.text('Dicatat oleh', 'by', 16), C.text('Dibatalkan pada', 'voided', 18)], waivers, { totals: ['amount'] });
  add('Pengeluaran', [C.date('Tanggal', 'date'), C.text('Kategori', 'category', 24), C.money('Jumlah', 'amount'), C.text('Catatan', 'note', 34), C.text('Dicatat oleh', 'by', 16), C.text('Dibatalkan pada', 'voided', 18)], expenses, { totals: ['amount'] });
  add('Upah', [C.date('Tanggal', 'date'), C.text('Karyawan', 'employee', 26), C.money('Upah', 'amount'), C.text('Catatan', 'note', 34), C.text('Dicatat oleh', 'by', 16), C.text('Dibatalkan pada', 'voided', 18)], wages, { totals: ['amount'] });
  add('Air masuk', [C.date('Tanggal', 'date'), C.int('Liter', 'liters', 10), C.text('Catatan', 'note', 34), C.text('Dicatat oleh', 'by', 16), C.text('Dibatalkan pada', 'voided', 18)],
    refills.rows.map((r) => ({ date: r.d, liters: r.liters, note: r.note, by: r.by_name, voided: r.voided })));
  add('Koreksi stok', [C.text('Waktu', 'at', 18), C.int('Sisa (liter)', 'liters', 12), C.text('Catatan', 'note', 34), C.text('Dicatat oleh', 'by', 16)],
    adjustments.rows.map((r) => ({ at: r.at, liters: r.liters_after, note: r.note, by: r.by_name })));
  add('Konsumsi pribadi', [C.date('Tanggal', 'date'), C.int('Galon', 'gallons', 10), C.text('Catatan', 'note', 34), C.text('Dicatat oleh', 'by', 16), C.text('Dibatalkan pada', 'voided', 18)],
    personal.rows.map((r) => ({ date: r.d, gallons: r.gallons, note: r.note, by: r.by_name, voided: r.voided })));
  add('Pengaturan', [C.text('Kunci', 'key', 28), C.text('Nilai', 'value', 20)], settings.rows);

  info.getColumn(1).width = 30;
  info.getColumn(2).width = 60;
  info.addRow(['Cadangan data Tomodachiqua Depot']).font = { bold: true, size: 14 };
  info.addRow(['Dibuat', `${jakartaDate()} (zona Asia/Jakarta)`]);
  info.addRow(['Catatan', 'Berisi semua data sepanjang waktu, termasuk yang dibatalkan (ditandai kolom "Dibatalkan pada"). Akun pengguna dan password tidak disertakan.']);
  info.addRow([]);
  info.addRow(['Lembar', 'Jumlah baris']).font = { bold: true };
  for (const [name, n] of Object.entries(counts)) info.addRow([name, n]);

  return { workbook: wb, fileName: `cadangan-tomodachiqua-${jakartaDate()}.xlsx` };
}

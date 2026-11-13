// Impor Excel: baca berkas, validasi tiap baris (tanpa menyimpan), lalu simpan semua-atau-tidak-sama-sekali.
// Harga order lama dihitung oleh pricing.mjs (satu sumber aturan harga); pembayaran dari status Lunas/Dibayar.
import { createHash, randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { pool, query } from '../../db/pool.mjs';
import { AppError } from '../../errors.mjs';
import { jakartaDate, now } from '../clock.mjs';
import { MANUAL_CATEGORIES } from '../expenseCategories.mjs';
import { calculateOrder } from '../pricing.mjs';
import { getPrices } from '../settings.mjs';
import * as cell from './cells.mjs';
import { CATEGORY_LABELS, KINDS, MAX_ROWS } from './kinds.mjs';

const MIN_DATE = '2000-01-01';
const PREVIEW_ROWS = 20;
const MAX_REPORTED_ERRORS = 200;

// ---------- membaca berkas ----------

export async function readRows(buffer, kind) {
  const def = KINDS[kind];
  if (!buffer || buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new AppError(400, 'INVALID_FILE', 'Berkas harus berformat Excel .xlsx. Jika berkas .xls atau .csv, simpan ulang sebagai .xlsx.');
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new AppError(400, 'INVALID_FILE', 'Berkas Excel tidak bisa dibaca. Pastikan berkasnya tidak rusak atau diproteksi password.');
  }

  const byName = wb.worksheets.find((s) => s.name.trim().toLowerCase() === def.sheet.toLowerCase());
  const ws = byName ?? wb.worksheets.find((s) => s.name.trim().toLowerCase() !== 'petunjuk');
  if (!ws) throw new AppError(400, 'WRONG_TEMPLATE', `Lembar "${def.sheet}" tidak ditemukan. Gunakan template yang diunduh dari aplikasi.`);

  // Judul kolom ada di baris 1.
  const headerRow = ws.getRow(1);
  const colOf = {};
  headerRow.eachCell({ includeEmpty: false }, (c, colNumber) => {
    colOf[cell.normalizeHeader(c.value)] = colNumber;
  });
  const missing = def.columns.filter((c) => c.required && !colOf[c.header.toLowerCase()]).map((c) => c.header);
  if (missing.length) {
    throw new AppError(400, 'WRONG_TEMPLATE', `Kolom wajib tidak ditemukan: ${missing.join(', ')}. Gunakan template ${def.label} dari aplikasi.`);
  }

  const last = ws.rowCount;
  if (last - 1 > MAX_ROWS * 4) throw new AppError(400, 'TOO_MANY_ROWS', `Berkas terlalu besar. Maksimal ${MAX_ROWS} baris per impor.`);

  const rows = [];
  for (let n = 2; n <= last; n += 1) {
    const row = ws.getRow(n);
    const cells = {};
    let any = false;
    for (const col of def.columns) {
      const idx = colOf[col.header.toLowerCase()];
      const raw = idx ? row.getCell(idx).value : null;
      cells[col.key] = raw;
      if (!cell.isBlank(cell.cellValue(raw))) any = true;
    }
    if (any) rows.push({ rowNumber: n, cells });
  }
  if (rows.length === 0) throw new AppError(400, 'EMPTY_FILE', 'Berkas tidak berisi baris data. Isi data mulai dari baris 2.');
  if (rows.length > MAX_ROWS) throw new AppError(400, 'TOO_MANY_ROWS', `Berkas berisi ${rows.length} baris. Maksimal ${MAX_ROWS} baris per impor.`);
  return rows;
}

// ---------- validasi per baris (murni) ----------

// Mengumpulkan galat per kolom. parse = hasil fungsi di cells.mjs.
function collector() {
  const errors = [];
  const take = (column, parsed, { required = false, label = column } = {}) => {
    if (!parsed.ok) {
      errors.push({ column, message: parsed.message });
      return undefined;
    }
    if (required && (parsed.value === null || parsed.value === undefined)) {
      errors.push({ column, message: `${label} wajib diisi.` });
      return undefined;
    }
    return parsed.value;
  };
  const add = (column, message) => errors.push({ column, message });
  return { errors, take, add };
}

export function validateCustomer(cells, ctx, seen) {
  const { errors, take, add } = collector();
  const name = take('Nama', cell.text(cells.name, { max: 100 }), { required: true });
  const phone = take('Telepon', cell.text(cells.phone, { max: 30 }));
  const address = take('Alamat', cell.text(cells.address, { max: 300 }));
  const customPrice = take('Harga khusus', cell.integer(cells.customPrice));
  if (customPrice != null && (customPrice < 1 || customPrice > 1_000_000)) add('Harga khusus', 'Harus antara Rp 1 dan Rp 1.000.000.');
  const buy = take('Paket beli', cell.integer(cells.bundleBuy));
  const pay = take('Paket bayar', cell.integer(cells.bundlePay));
  if ((buy == null) !== (pay == null)) add(buy == null ? 'Paket beli' : 'Paket bayar', 'Isi Paket beli dan Paket bayar bersamaan, atau kosongkan keduanya.');
  else if (buy != null) {
    if (buy < 1 || buy > 1000) add('Paket beli', 'Harus antara 1 dan 1000.');
    else if (pay < 1 || pay >= buy) add('Paket bayar', 'Harus lebih kecil dari Paket beli dan minimal 1.');
  }
  const active = take('Aktif', cell.yesNo(cells.active)) ?? true;

  if (name) {
    const key = name.toLowerCase();
    if (seen.has(key)) add('Nama', `Nama sama dengan baris ${seen.get(key)} di berkas ini.`);
    else if (ctx.customers.has(key)) add('Nama', 'Pelanggan dengan nama ini sudah ada di aplikasi.');
  }
  return { errors, value: errors.length ? null : { name, phone, address, customPrice, bundleBuy: buy ?? null, bundlePay: pay ?? null, isActive: active } };
}

export function validateOrder(cells, ctx) {
  const { errors, take, add } = collector();
  const dateStr = take('Tanggal', cell.date(cells.date), { required: true });
  if (dateStr && dateStr < MIN_DATE) add('Tanggal', `Tanggal terlalu lama (paling awal ${MIN_DATE}).`);
  if (dateStr && dateStr > ctx.today) add('Tanggal', 'Tanggal tidak boleh di masa depan.');
  const timeStr = take('Jam', cell.time(cells.time)) ?? '12:00';

  const customerName = take('Pelanggan', cell.text(cells.customer, { max: 100 }));
  let customer = null;
  if (customerName) {
    customer = ctx.customers.get(customerName.toLowerCase()) ?? null;
    if (!customer) add('Pelanggan', `Pelanggan "${customerName}" belum ada. Impor template Pelanggan dulu, atau kosongkan untuk pelanggan umum.`);
  }

  const qty = take('Jumlah galon', cell.integer(cells.qty), { required: true });
  if (qty != null && (qty < 1 || qty > 1000)) add('Jumlah galon', 'Harus antara 1 dan 1000.');
  const delivered = take('Diantar', cell.yesNo(cells.delivered));
  if (delivered === undefined && !errors.some((e) => e.column === 'Diantar')) add('Diantar', 'Isi Ya atau Tidak.');

  const statusRaw = take('Status', cell.text(cells.status, { max: 20 }), { required: true });
  const status = statusRaw ? { lunas: 'PAID', utang: 'DEBT' }[statusRaw.toLowerCase()] : undefined;
  if (statusRaw && !status) add('Status', 'Isi Lunas atau Utang.');
  const paidInput = take('Dibayar', cell.integer(cells.paid));
  if (paidInput != null && paidInput < 0) add('Dibayar', 'Tidak boleh negatif.');
  const note = take('Catatan', cell.text(cells.note, { max: 200 }));
  if (status === 'DEBT' && !customer && customerName == null && !note) add('Catatan', 'Wajib diisi untuk utang pelanggan umum (siapa yang berutang).');

  let price = null;
  if (qty != null && qty >= 1 && qty <= 1000 && delivered !== undefined && !errors.some((e) => e.column === 'Jumlah galon')) {
    price = calculateOrder({
      qty,
      isDelivered: delivered,
      customPrice: customer?.customPrice ?? null,
      bundleBuy: customer?.bundleBuy ?? null,
      bundlePay: customer?.bundlePay ?? null,
      prices: ctx.prices,
    });
  }

  let paidNow = 0;
  if (price && status === 'PAID') {
    if (paidInput != null && paidInput !== price.total) add('Dibayar', `Untuk status Lunas, kosongkan kolom ini atau isi sama dengan total (Rp ${price.total}).`);
    paidNow = price.total;
  } else if (price && status === 'DEBT') {
    if (paidInput != null && paidInput >= price.total && paidInput > 0) add('Dibayar', `Harus kurang dari total (Rp ${price.total}). Gunakan status Lunas bila sudah lunas.`);
    else paidNow = paidInput ?? 0;
  }

  if (errors.length || !price) return { errors, value: null };
  return {
    errors,
    value: {
      date: dateStr,
      time: timeStr,
      orderedAt: new Date(`${dateStr}T${timeStr}:00+07:00`),
      customerId: customer?.id ?? null,
      customerName: customer?.name ?? null,
      qty,
      isDelivered: delivered,
      unitPrice: price.unitPrice,
      paidQty: price.paidQty,
      freeQty: price.freeQty,
      total: price.total,
      status,
      paid: paidNow,
      note,
    },
  };
}

const categoryByName = new Map(MANUAL_CATEGORIES.flatMap((c) => [[c.label.toLowerCase(), c], [c.code.toLowerCase(), c]]));

export function validateExpense(cells, ctx) {
  const { errors, take, add } = collector();
  const dateStr = take('Tanggal', cell.date(cells.date), { required: true });
  if (dateStr && dateStr < MIN_DATE) add('Tanggal', `Tanggal terlalu lama (paling awal ${MIN_DATE}).`);
  if (dateStr && dateStr > ctx.today) add('Tanggal', 'Tanggal tidak boleh di masa depan.');

  const catRaw = take('Kategori', cell.text(cells.category, { max: 50 }), { required: true });
  let category = null;
  if (catRaw) {
    const key = catRaw.toLowerCase();
    if (key === 'upah' || key === 'gaji dan upah') add('Kategori', 'Upah dicatat lewat menu Upah, bukan di pengeluaran.');
    else if (categoryByName.has(key)) category = categoryByName.get(key);
    else add('Kategori', `Kategori tidak dikenal. Pilihan: ${CATEGORY_LABELS.join(', ')}.`);
  }
  const amount = take('Jumlah', cell.integer(cells.amount), { required: true });
  if (amount != null && (amount < 1 || amount > 1_000_000_000)) add('Jumlah', 'Harus antara Rp 1 dan Rp 1.000.000.000.');
  const note = take('Catatan', cell.text(cells.note, { max: 200 }));

  return { errors, value: errors.length ? null : { date: dateStr, category: category.code, categoryLabel: category.label, amount, note } };
}

// ---------- memeriksa (dry-run) ----------

async function loadContext() {
  const [customers, prices, adj] = await Promise.all([
    query('SELECT id, name, custom_price, bundle_buy, bundle_pay, is_active FROM customers'),
    getPrices(),
    query('SELECT max(adjusted_at) AS at FROM tank_adjustments'),
  ]);
  return {
    today: jakartaDate(),
    prices,
    lastAdjustmentAt: adj.rows[0].at,
    customers: new Map(
      customers.rows.map((c) => [
        c.name.toLowerCase(),
        { id: Number(c.id), name: c.name, customPrice: c.custom_price, bundleBuy: c.bundle_buy, bundlePay: c.bundle_pay, isActive: c.is_active },
      ]),
    ),
  };
}

const hashOf = (buffer) => createHash('sha256').update(buffer).digest('hex');

function summarize(kind, values, ctx) {
  if (kind === 'CUSTOMERS') {
    return {
      count: values.length,
      withCustomPrice: values.filter((v) => v.customPrice != null).length,
      withBundle: values.filter((v) => v.bundleBuy != null).length,
      inactive: values.filter((v) => !v.isActive).length,
    };
  }
  if (kind === 'ORDERS') {
    const dates = values.map((v) => v.date).sort();
    const paidAtOrder = values.reduce((s, v) => s + v.paid, 0);
    const total = values.reduce((s, v) => s + v.total, 0);
    return {
      count: values.length,
      gallons: values.reduce((s, v) => s + v.qty, 0),
      totalValue: total,
      paidAtOrder,
      unpaid: total - paidAtOrder,
      paidCount: values.filter((v) => v.status === 'PAID').length,
      debtCount: values.filter((v) => v.status === 'DEBT').length,
      dateFrom: dates[0],
      dateTo: dates.at(-1),
      afterLastAdjustment: ctx.lastAdjustmentAt ? values.filter((v) => v.orderedAt > ctx.lastAdjustmentAt).length : 0,
    };
  }
  const dates = values.map((v) => v.date).sort();
  return { count: values.length, total: values.reduce((s, v) => s + v.amount, 0), dateFrom: dates[0], dateTo: dates.at(-1) };
}

function previewOf(kind, values) {
  return values.slice(0, PREVIEW_ROWS).map((v) =>
    kind === 'CUSTOMERS'
      ? { name: v.name, phone: v.phone, customPrice: v.customPrice, bundle: v.bundleBuy ? `${v.bundleBuy} bayar ${v.bundlePay}` : null, isActive: v.isActive }
      : kind === 'ORDERS'
        ? { date: v.date, time: v.time, customer: v.customerName ?? 'Umum', qty: v.qty, isDelivered: v.isDelivered, unitPrice: v.unitPrice, freeQty: v.freeQty, total: v.total, status: v.status, paid: v.paid, note: v.note }
        : { date: v.date, category: v.categoryLabel, amount: v.amount, note: v.note },
  );
}

// Membaca dan memvalidasi tanpa menyimpan. Mengembalikan hasil untuk layar plus nilai valid untuk penyimpanan.
export async function analyze(kind, buffer, fileName) {
  const def = KINDS[kind];
  const rows = await readRows(buffer, kind);
  const ctx = await loadContext();
  const fileHash = hashOf(buffer);

  const errors = [];
  const values = [];
  const seen = new Map();
  for (const { rowNumber, cells } of rows) {
    const r = kind === 'CUSTOMERS' ? validateCustomer(cells, ctx, seen) : kind === 'ORDERS' ? validateOrder(cells, ctx) : validateExpense(cells, ctx);
    if (r.errors.length) for (const e of r.errors) errors.push({ row: rowNumber, ...e });
    else values.push(r.value);
    if (kind === 'CUSTOMERS' && r.value) seen.set(r.value.name.toLowerCase(), rowNumber);
  }

  const dup = await query('SELECT id, created_at FROM import_batches WHERE file_hash = $1 AND voided_at IS NULL', [fileHash]);
  const alreadyImported = dup.rows[0] ? { id: Number(dup.rows[0].id), at: dup.rows[0].created_at } : null;

  const summary = values.length ? summarize(kind, values, ctx) : {};
  const warnings = [];
  if (kind === 'ORDERS' && summary.afterLastAdjustment > 0) {
    warnings.push(`${summary.afterLastAdjustment} order bertanggal setelah koreksi stok terakhir, sehingga akan mengurangi hitungan stok toren.`);
  }

  const result = {
    kind,
    label: def.label,
    fileName,
    rowCount: rows.length,
    validCount: values.length,
    errorCount: new Set(errors.map((e) => e.row)).size,
    errors: errors.slice(0, MAX_REPORTED_ERRORS),
    errorsTruncated: errors.length > MAX_REPORTED_ERRORS,
    warnings,
    summary,
    preview: previewOf(kind, values),
    alreadyImported,
    canCommit: errors.length === 0 && values.length > 0 && !alreadyImported,
  };
  return { result, values, fileHash, summary };
}

// ---------- menyimpan ----------

const chunks = (arr, size = 500) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));

async function insertCustomers(client, values, batchId) {
  for (const part of chunks(values)) {
    await client.query(
      `INSERT INTO customers (name, phone, address, custom_price, bundle_buy, bundle_pay, is_active, import_batch_id)
       SELECT t.n, t.p, t.a, t.cp, t.bb, t.bp, t.act, $8::bigint
       FROM unnest($1::text[], $2::text[], $3::text[], $4::int[], $5::int[], $6::int[], $7::bool[]) AS t(n, p, a, cp, bb, bp, act)`,
      [part.map((v) => v.name), part.map((v) => v.phone), part.map((v) => v.address), part.map((v) => v.customPrice), part.map((v) => v.bundleBuy), part.map((v) => v.bundlePay), part.map((v) => v.isActive), batchId],
    );
  }
}

async function insertOrders(client, values, batchId, userId) {
  for (const part of chunks(values)) {
    const rids = part.map(() => randomUUID()); // penanda sementara untuk menghubungkan pembayaran ke order
    const { rows } = await client.query(
      `INSERT INTO orders (customer_id, qty, is_delivered, unit_price, paid_qty, total, note, created_by, ordered_at, client_request_id, import_batch_id)
       SELECT t.cid, t.qty, t.del, t.unit, t.pq, t.total, t.note, $8::bigint, t.at, t.rid, $9::bigint
       FROM unnest($1::bigint[], $2::int[], $3::bool[], $4::int[], $5::int[], $6::int[], $7::text[], $10::timestamptz[], $11::uuid[])
            AS t(cid, qty, del, unit, pq, total, note, at, rid)
       RETURNING id, client_request_id`,
      [
        part.map((v) => v.customerId), part.map((v) => v.qty), part.map((v) => v.isDelivered), part.map((v) => v.unitPrice),
        part.map((v) => v.paidQty), part.map((v) => v.total), part.map((v) => v.note), userId, batchId,
        part.map((v) => v.orderedAt.toISOString()), rids,
      ],
    );
    const idOf = new Map(rows.map((r) => [r.client_request_id, r.id]));
    const withPayment = part.map((v, i) => ({ v, orderId: idOf.get(rids[i]) })).filter((x) => x.v.paid > 0);
    if (withPayment.length) {
      await client.query(
        `INSERT INTO payments (customer_id, order_id, amount, created_by, paid_at, import_batch_id)
         SELECT t.cid, t.oid, t.amount, $5::bigint, t.at, $6::bigint
         FROM unnest($1::bigint[], $2::bigint[], $3::int[], $4::timestamptz[]) AS t(cid, oid, amount, at)`,
        [withPayment.map((x) => x.v.customerId), withPayment.map((x) => x.orderId), withPayment.map((x) => x.v.paid), withPayment.map((x) => x.v.orderedAt.toISOString()), userId, batchId],
      );
    }
  }
}

async function insertExpenses(client, values, batchId, userId) {
  const at = now().toISOString();
  for (const part of chunks(values)) {
    await client.query(
      `INSERT INTO expenses (spent_date, category, amount, note, created_by, created_at, import_batch_id)
       SELECT t.d, t.c, t.a, t.n, $5::bigint, $6::timestamptz, $7::bigint
       FROM unnest($1::date[], $2::text[], $3::int[], $4::text[]) AS t(d, c, a, n)`,
      [part.map((v) => v.date), part.map((v) => v.category), part.map((v) => v.amount), part.map((v) => v.note), userId, at, batchId],
    );
  }
}

export async function commitImport(kind, buffer, fileName, user) {
  const { result, values, fileHash, summary } = await analyze(kind, buffer, fileName);
  if (result.alreadyImported) {
    throw new AppError(409, 'ALREADY_IMPORTED', 'Berkas yang sama sudah pernah diimpor. Batalkan impor sebelumnya jika ingin mengimpor ulang.');
  }
  if (!result.canCommit) {
    throw new AppError(400, 'IMPORT_INVALID', 'Masih ada galat di berkas. Perbaiki dulu lalu periksa ulang.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const b = await client.query(
      `INSERT INTO import_batches (kind, file_name, file_hash, row_count, summary, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [kind, fileName.slice(0, 200), fileHash, values.length, JSON.stringify(summary), user.id, now()],
    );
    const batchId = Number(b.rows[0].id);
    if (kind === 'CUSTOMERS') await insertCustomers(client, values, batchId);
    else if (kind === 'ORDERS') await insertOrders(client, values, batchId, user.id);
    else await insertExpenses(client, values, batchId, user.id);
    await client.query('COMMIT');
    return { batchId, kind, imported: values.length, summary };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      throw new AppError(409, err.constraint?.includes('hash') ? 'ALREADY_IMPORTED' : 'DUPLICATE_NAME', err.constraint?.includes('hash') ? 'Berkas yang sama sudah pernah diimpor.' : 'Ada nama pelanggan yang sudah dipakai. Periksa ulang berkas.');
    }
    throw err;
  } finally {
    client.release();
  }
}

// ---------- riwayat dan pembatalan ----------

export async function listBatches() {
  const { rows } = await query(
    `SELECT b.id, b.kind, b.file_name, b.row_count, b.summary, b.created_at, b.voided_at, u.name AS by_name
     FROM import_batches b JOIN users u ON u.id = b.created_by
     ORDER BY b.id DESC LIMIT 50`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    kind: r.kind,
    kindLabel: KINDS[r.kind].label,
    fileName: r.file_name,
    rowCount: r.row_count,
    summary: r.summary,
    byName: r.by_name,
    createdAt: r.created_at,
    voidedAt: r.voided_at,
  }));
}

// Membatalkan satu impor: order (beserta pembayaran dan keringanannya) dan pengeluaran ditandai batal.
// Pelanggan hasil impor tidak dihapus (mungkin sudah dipakai).
export async function voidBatch(id, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id, kind, voided_at FROM import_batches WHERE id = $1 FOR UPDATE', [id]);
    const batch = rows[0];
    if (!batch) throw new AppError(404, 'BATCH_NOT_FOUND', 'Impor tidak ditemukan.');
    if (batch.voided_at) throw new AppError(409, 'ALREADY_VOIDED', 'Impor ini sudah dibatalkan.');
    const at = now();
    const orders = await client.query(
      'UPDATE orders SET voided_at = $2, voided_by = $3 WHERE import_batch_id = $1 AND voided_at IS NULL RETURNING id',
      [id, at, user.id],
    );
    const orderIds = orders.rows.map((r) => r.id);
    if (orderIds.length) {
      await client.query('UPDATE payments SET voided_at = $2 WHERE order_id = ANY($1::bigint[]) AND voided_at IS NULL', [orderIds, at]);
      await client.query('UPDATE debt_waivers SET voided_at = $2 WHERE order_id = ANY($1::bigint[]) AND voided_at IS NULL', [orderIds, at]);
    }
    const expenses = await client.query('UPDATE expenses SET voided_at = $2 WHERE import_batch_id = $1 AND voided_at IS NULL RETURNING id', [id, at]);
    await client.query('UPDATE import_batches SET voided_at = $2, voided_by = $3 WHERE id = $1', [id, at, user.id]);
    await client.query('COMMIT');
    return { kind: batch.kind, voidedOrders: orderIds.length, voidedExpenses: expenses.rowCount };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

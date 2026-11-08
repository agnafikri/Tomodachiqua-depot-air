// Utang = total order (tidak dibatalkan) - pembayaran (tidak dibatalkan). Selalu dihitung dari
// tabel orders dan payments, tidak disimpan terpisah, sehingga daftar utang tidak bisa tidak cocok.
//
// Pembayaran utang pelanggan bernama dialokasikan ke order TERTUA dulu. Utang pelanggan Umum
// (tanpa nama) dibayar per order.
import { randomUUID } from 'node:crypto';
import { pool, query } from '../db/pool.mjs';
import { AppError } from '../errors.mjs';
import { jakartaDate, now } from './clock.mjs';
import { getCustomer } from './customers.mjs';

// Order yang belum lunas, lengkap dengan sisa utangnya.
const OPEN_ORDERS_SQL = `
  SELECT o.id, o.customer_id, o.ordered_at, o.qty, o.total, o.note,
         COALESCE(p.paid, 0)::int AS paid,
         (o.total - COALESCE(p.paid, 0))::int AS outstanding
  FROM orders o
  LEFT JOIN LATERAL (
    SELECT SUM(amount) AS paid FROM payments WHERE order_id = o.id AND voided_at IS NULL
  ) p ON TRUE
  WHERE o.voided_at IS NULL AND o.total - COALESCE(p.paid, 0) > 0`;

const toOpenOrder = (r) => ({
  orderId: Number(r.id),
  orderedAt: r.ordered_at,
  qty: r.qty,
  total: r.total,
  paid: r.paid,
  outstanding: r.outstanding,
  note: r.note,
});

export async function listDebts() {
  const [customers, umum] = await Promise.all([
    query(
      `SELECT c.id, c.name, c.phone, c.is_active,
              SUM(d.outstanding)::int AS outstanding, COUNT(*)::int AS order_count, MIN(d.ordered_at) AS oldest_at
       FROM (${OPEN_ORDERS_SQL}) d JOIN customers c ON c.id = d.customer_id
       GROUP BY c.id ORDER BY SUM(d.outstanding) DESC, lower(c.name)`,
    ),
    query(`SELECT d.* FROM (${OPEN_ORDERS_SQL}) d WHERE d.customer_id IS NULL ORDER BY d.ordered_at, d.id`),
  ]);

  const customerList = customers.rows.map((r) => ({
    customerId: Number(r.id),
    name: r.name,
    phone: r.phone,
    isActive: r.is_active,
    outstanding: r.outstanding,
    orderCount: r.order_count,
    oldestAt: r.oldest_at,
  }));
  const umumOrders = umum.rows.map(toOpenOrder);
  const customerTotal = customerList.reduce((s, c) => s + c.outstanding, 0);
  const umumTotal = umumOrders.reduce((s, o) => s + o.outstanding, 0);
  return { customers: customerList, umumOrders, totals: { total: customerTotal + umumTotal, customerTotal, umumTotal } };
}

export async function getTotalDebt() {
  const { rows } = await query(`SELECT COALESCE(SUM(outstanding), 0)::int AS total FROM (${OPEN_ORDERS_SQL}) d`);
  return rows[0].total;
}

export async function getCustomerDebt(customerId, user) {
  const customer = await getCustomer(customerId);
  if (!customer) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan.');

  const open = await query(`SELECT d.* FROM (${OPEN_ORDERS_SQL}) d WHERE d.customer_id = $1 ORDER BY d.ordered_at, d.id`, [customerId]);
  const orders = open.rows.map(toOpenOrder);

  // Riwayat pembayaran dikelompokkan per batch; pembayaran saat order (tanpa batch) tampil per order.
  const pay = await query(
    `SELECT MIN(p.batch_id::text) AS batch_id, SUM(p.amount)::int AS amount, MIN(p.paid_at) AS paid_at,
            array_agg(p.order_id ORDER BY p.order_id) AS order_ids, MIN(u.name) AS by_name
     FROM payments p JOIN users u ON u.id = p.created_by
     WHERE p.customer_id = $1 AND p.voided_at IS NULL
     GROUP BY COALESCE(p.batch_id::text, 'p' || p.id::text)
     ORDER BY MIN(p.paid_at) DESC, MIN(p.id) DESC LIMIT 30`,
    [customerId],
  );
  const today = jakartaDate();
  const payments = pay.rows.map((r) => ({
    batchId: r.batch_id,
    source: r.batch_id ? 'DEBT' : 'ORDER', // ORDER = dibayar saat order dibuat
    amount: r.amount,
    paidAt: r.paid_at,
    orderIds: r.order_ids.map(Number),
    byName: r.by_name,
    canVoid: Boolean(r.batch_id) && (user.role === 'ADMIN' || jakartaDate(r.paid_at) === today),
  }));

  return { customer, outstanding: orders.reduce((s, o) => s + o.outstanding, 0), orders, payments };
}

// Menyimpan pembayaran utang. Tepat salah satu dari customerId (alokasi order tertua dulu) atau orderId (satu order).
export async function recordPayment({ customerId, orderId, amount, clientRequestId }, user) {
  const batchId = clientRequestId ?? randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Satu permintaan yang sama tidak boleh diproses bersamaan (ketukan ganda).
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [batchId]);

    const dup = await client.query('SELECT 1 FROM payments WHERE batch_id = $1 LIMIT 1', [batchId]);
    if (dup.rowCount > 0) {
      await client.query('ROLLBACK');
      return { ...(await summarizeBatch(batchId)), duplicate: true };
    }

    // 1) kunci order yang terlibat, 2) baru hitung sisa utang (agar pembayaran serentak tidak melebihi utang)
    let ownerId = customerId ?? null;
    if (orderId != null) {
      const locked = await client.query('SELECT id, customer_id, voided_at FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
      if (!locked.rows[0] || locked.rows[0].voided_at) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order tidak ditemukan.');
      ownerId = locked.rows[0].customer_id == null ? null : Number(locked.rows[0].customer_id);
    } else {
      const c = await client.query('SELECT id FROM customers WHERE id = $1', [customerId]);
      if (!c.rows[0]) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan.');
      await client.query('SELECT id FROM orders WHERE customer_id = $1 AND voided_at IS NULL FOR UPDATE', [customerId]);
    }

    const open = await client.query(
      `SELECT d.id, d.outstanding FROM (${OPEN_ORDERS_SQL}) d
       WHERE ${orderId != null ? 'd.id = $1' : 'd.customer_id = $1'} ORDER BY d.ordered_at, d.id`,
      [orderId != null ? orderId : customerId],
    );
    const totalDebt = open.rows.reduce((s, r) => s + r.outstanding, 0);
    if (totalDebt === 0) throw new AppError(400, 'NO_DEBT', 'Tidak ada utang yang perlu dibayar.');
    if (amount > totalDebt) {
      throw new AppError(400, 'OVERPAY', `Jumlah melebihi sisa utang (${totalDebt}).`);
    }

    let left = amount;
    const at = now();
    for (const row of open.rows) {
      if (left === 0) break;
      const part = Math.min(row.outstanding, left);
      await client.query(
        'INSERT INTO payments (customer_id, order_id, amount, created_by, paid_at, batch_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [ownerId, row.id, part, user.id, at, batchId],
      );
      left -= part;
    }
    await client.query('COMMIT');
    return { ...(await summarizeBatch(batchId)), remainingDebt: totalDebt - amount, duplicate: false };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function summarizeBatch(batchId) {
  const { rows } = await query('SELECT order_id, amount FROM payments WHERE batch_id = $1 ORDER BY id', [batchId]);
  return {
    batchId,
    amount: rows.reduce((s, r) => s + r.amount, 0),
    allocations: rows.map((r) => ({ orderId: Number(r.order_id), amount: r.amount })),
  };
}

// Membatalkan satu pembayaran utang (seluruh batch). PEMILIK hanya yang dibayar hari ini; ADMIN kapan saja.
export async function voidPaymentBatch(batchId, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT id, paid_at FROM payments WHERE batch_id = $1 AND voided_at IS NULL FOR UPDATE',
      [batchId],
    );
    if (rows.length === 0) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Pembayaran tidak ditemukan atau sudah dibatalkan.');
    if (user.role !== 'ADMIN' && jakartaDate(rows[0].paid_at) !== jakartaDate()) {
      throw new AppError(403, 'VOID_NOT_ALLOWED', 'Pembayaran hari sebelumnya hanya bisa dibatalkan oleh admin.');
    }
    await client.query('UPDATE payments SET voided_at = $2 WHERE batch_id = $1 AND voided_at IS NULL', [batchId, now()]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

import { pool, query } from '../db/pool.mjs';
import { AppError } from '../errors.mjs';
import { getCustomer } from './customers.mjs';
import { calculateOrder } from './pricing.mjs';
import { getPrices } from './settings.mjs';

const TZ = 'Asia/Jakarta';

function toOrder(row) {
  const paidAmount = Number(row.paid_amount ?? 0);
  const total = row.total;
  return {
    id: Number(row.id),
    customerId: row.customer_id == null ? null : Number(row.customer_id),
    customerName: row.customer_name ?? null,
    qty: row.qty,
    isDelivered: row.is_delivered,
    unitPrice: row.unit_price,
    paidQty: row.paid_qty,
    freeQty: row.qty - row.paid_qty,
    total,
    paidAmount,
    paymentStatus: paidAmount >= total ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'DEBT',
    note: row.note,
    orderedAt: row.ordered_at,
    voidedAt: row.voided_at,
    createdByName: row.created_by_name ?? null,
  };
}

// Menghitung harga untuk pelanggan tertentu (null = umum). Dipakai preview dan simpan order.
export async function priceFor({ customerId, qty, isDelivered }, db = { query }) {
  let customer = null;
  if (customerId != null) {
    customer = await getCustomer(customerId, db);
    if (!customer) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan.');
    if (!customer.isActive) throw new AppError(400, 'CUSTOMER_INACTIVE', 'Pelanggan ini sudah dinonaktifkan.');
  }
  const prices = await getPrices(db);
  return calculateOrder({
    qty,
    isDelivered,
    customPrice: customer?.customPrice ?? null,
    bundleBuy: customer?.bundleBuy ?? null,
    bundlePay: customer?.bundlePay ?? null,
    prices,
  });
}

const ORDER_SELECT = `
  SELECT o.*, c.name AS customer_name, u.name AS created_by_name,
         COALESCE(p.paid, 0) AS paid_amount
  FROM orders o
  LEFT JOIN customers c ON c.id = o.customer_id
  LEFT JOIN users u ON u.id = o.created_by
  LEFT JOIN LATERAL (
    SELECT SUM(amount) AS paid FROM payments
    WHERE order_id = o.id AND voided_at IS NULL
  ) p ON TRUE`;

export async function getOrder(id, db = { query }) {
  const { rows } = await db.query(`${ORDER_SELECT} WHERE o.id = $1`, [id]);
  return rows[0] ? toOrder(rows[0]) : null;
}

export async function createOrder({ customerId, qty, isDelivered, payStatus, note, clientRequestId }, user) {
  if (payStatus === 'DEBT' && customerId == null) {
    throw new AppError(400, 'DEBT_NEEDS_CUSTOMER', 'Order utang harus untuk pelanggan bernama, bukan pelanggan umum.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const price = await priceFor({ customerId, qty, isDelivered }, client);

    const inserted = await client.query(
      `INSERT INTO orders (customer_id, qty, is_delivered, unit_price, paid_qty, total, note, created_by, client_request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (client_request_id) DO NOTHING
       RETURNING id`,
      [customerId, qty, isDelivered, price.unitPrice, price.paidQty, price.total, note ?? null, user.id, clientRequestId ?? null],
    );

    // Permintaan yang sama terkirim dua kali: kembalikan order yang sudah ada, jangan buat baru.
    if (inserted.rowCount === 0) {
      await client.query('ROLLBACK');
      const { rows } = await client.query('SELECT id FROM orders WHERE client_request_id = $1', [clientRequestId]);
      return { order: await getOrder(rows[0].id), duplicate: true };
    }

    const orderId = inserted.rows[0].id;
    if (payStatus === 'PAID') {
      await client.query(
        'INSERT INTO payments (customer_id, order_id, amount, created_by) VALUES ($1, $2, $3, $4)',
        [customerId, orderId, price.total, user.id],
      );
    }
    await client.query('COMMIT');
    return { order: await getOrder(orderId), duplicate: false };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// from/to = tanggal 'YYYY-MM-DD' (zona Asia/Jakarta), keduanya inklusif. Default: hari ini.
export async function listOrders({ from, to, customerId }) {
  const params = [];
  const where = ['o.voided_at IS NULL'];
  const day = (value) => {
    params.push(value);
    return `$${params.length}::date`;
  };

  const fromExpr = from ? day(from) : `(now() AT TIME ZONE '${TZ}')::date`;
  const toExpr = to ? day(to) : from ? fromExpr : `(now() AT TIME ZONE '${TZ}')::date`;
  where.push(`o.ordered_at >= (${fromExpr})::timestamp AT TIME ZONE '${TZ}'`);
  where.push(`o.ordered_at <  ((${toExpr}) + 1)::timestamp AT TIME ZONE '${TZ}'`);

  if (customerId != null) {
    params.push(customerId);
    where.push(`o.customer_id = $${params.length}`);
  }

  const { rows } = await query(`${ORDER_SELECT} WHERE ${where.join(' AND ')} ORDER BY o.ordered_at DESC, o.id DESC LIMIT 500`, params);
  const orders = rows.map(toOrder);
  const summary = orders.reduce(
    (s, o) => ({
      orderCount: s.orderCount + 1,
      gallons: s.gallons + o.qty,
      total: s.total + o.total,
      unpaid: s.unpaid + Math.max(o.total - o.paidAmount, 0),
    }),
    { orderCount: 0, gallons: 0, total: 0, unpaid: 0 },
  );
  return { orders, summary };
}

// Membatalkan order (tidak menghapus). PEMILIK hanya boleh membatalkan order hari ini;
// ADMIN boleh kapan saja. Pembayaran yang terikat order ikut dibatalkan.
export async function voidOrder(id, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, voided_at,
              (ordered_at AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date AS is_today
       FROM orders WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const order = rows[0];
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order tidak ditemukan.');
    if (order.voided_at) throw new AppError(409, 'ALREADY_VOIDED', 'Order ini sudah dibatalkan.');
    if (user.role !== 'ADMIN' && !order.is_today) {
      throw new AppError(403, 'VOID_NOT_ALLOWED', 'Order hari sebelumnya hanya bisa dibatalkan oleh admin.');
    }
    await client.query('UPDATE orders SET voided_at = now(), voided_by = $2 WHERE id = $1', [id, user.id]);
    await client.query('UPDATE payments SET voided_at = now() WHERE order_id = $1 AND voided_at IS NULL', [id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return getOrder(id);
}

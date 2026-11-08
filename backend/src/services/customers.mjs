import { query } from '../db/pool.mjs';
import { AppError } from '../errors.mjs';

const COLUMNS =
  'id, name, phone, address, custom_price, bundle_buy, bundle_pay, is_active';

export function toCustomer(row) {
  return {
    id: Number(row.id),
    name: row.name,
    phone: row.phone,
    address: row.address,
    customPrice: row.custom_price,
    bundleBuy: row.bundle_buy,
    bundlePay: row.bundle_pay,
    isActive: row.is_active,
  };
}

// "active" = true | false | 'all'
export async function listCustomers({ q, active = true } = {}) {
  const where = [];
  const params = [];
  if (active !== 'all') {
    params.push(active);
    where.push(`is_active = $${params.length}`);
  }
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
    where.push(`(name ILIKE $${params.length} OR phone ILIKE $${params.length})`);
  }
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM customers
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY lower(name) LIMIT 500`,
    params,
  );
  return rows.map(toCustomer);
}

export async function getCustomer(id, db = { query }) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM customers WHERE id = $1`, [id]);
  return rows[0] ? toCustomer(rows[0]) : null;
}

function mapConstraintError(err) {
  if (err.code === '23505') {
    return new AppError(409, 'DUPLICATE_NAME', 'Nama pelanggan sudah ada. Tambahkan keterangan agar berbeda, misalnya nama pasar.');
  }
  return err;
}

export async function createCustomer(data) {
  try {
    const { rows } = await query(
      `INSERT INTO customers (name, phone, address, custom_price, bundle_buy, bundle_pay)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNS}`,
      [data.name, data.phone ?? null, data.address ?? null, data.customPrice ?? null, data.bundleBuy ?? null, data.bundlePay ?? null],
    );
    return toCustomer(rows[0]);
  } catch (err) {
    throw mapConstraintError(err);
  }
}

// Hanya kolom yang dikirim yang diubah. Diskon paket selalu diganti sepasang.
export async function updateCustomer(id, data) {
  const sets = [];
  const params = [];
  const set = (column, value) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };

  if (data.name !== undefined) set('name', data.name);
  if (data.phone !== undefined) set('phone', data.phone);
  if (data.address !== undefined) set('address', data.address);
  if (data.customPrice !== undefined) set('custom_price', data.customPrice);
  if (data.bundleBuy !== undefined) {
    set('bundle_buy', data.bundleBuy);
    set('bundle_pay', data.bundlePay);
  }
  if (data.isActive !== undefined) set('is_active', data.isActive);
  if (!sets.length) throw new AppError(400, 'NO_CHANGES', 'Tidak ada data yang diubah.');

  params.push(id);
  try {
    const { rows } = await query(
      `UPDATE customers SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $${params.length} RETURNING ${COLUMNS}`,
      params,
    );
    if (!rows[0]) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan.');
    return toCustomer(rows[0]);
  } catch (err) {
    throw mapConstraintError(err);
  }
}

import { query } from '../db/pool.mjs';
import { AppError } from '../errors.mjs';
import { jakartaDate, now } from './clock.mjs';
import { categoryLabel } from './expenseCategories.mjs';
import { pool } from '../db/pool.mjs';

export async function addExpense({ spentDate, category, amount, note, clientRequestId }, user) {
  const at = now();
  const { rows } = await query(
    `INSERT INTO expenses (spent_date, category, amount, note, created_by, created_at, client_request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (client_request_id) DO NOTHING RETURNING id`,
    [spentDate ?? jakartaDate(at), category, amount, note ?? null, user.id, at, clientRequestId ?? null],
  );
  if (rows[0]) return { id: Number(rows[0].id), duplicate: false };
  const existing = await query('SELECT id FROM expenses WHERE client_request_id = $1', [clientRequestId]);
  return { id: Number(existing.rows[0].id), duplicate: true };
}

// Daftar pengeluaran dalam rentang tanggal. canVoid: PEMILIK hanya untuk catatan yang dibuat hari ini; ADMIN kapan saja.
export async function listExpenses({ from, to }, user) {
  const today = jakartaDate();
  const { rows } = await query(
    `SELECT e.id, e.spent_date::text AS spent_date, e.category, e.amount, e.note, e.created_at, u.name AS by_name
     FROM expenses e JOIN users u ON u.id = e.created_by
     WHERE e.voided_at IS NULL AND e.spent_date BETWEEN $1::date AND $2::date
     ORDER BY e.spent_date DESC, e.id DESC LIMIT 500`,
    [from, to],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    spentDate: r.spent_date,
    category: r.category,
    categoryLabel: categoryLabel(r.category),
    amount: r.amount,
    note: r.note,
    byName: r.by_name,
    canVoid: user.role === 'ADMIN' || jakartaDate(r.created_at) === today,
  }));
}

export async function voidExpense(id, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id, created_at, voided_at FROM expenses WHERE id = $1 FOR UPDATE', [id]);
    const row = rows[0];
    if (!row) throw new AppError(404, 'EXPENSE_NOT_FOUND', 'Pengeluaran tidak ditemukan.');
    if (row.voided_at) throw new AppError(409, 'ALREADY_VOIDED', 'Pengeluaran ini sudah dibatalkan.');
    if (user.role !== 'ADMIN' && jakartaDate(row.created_at) !== jakartaDate()) {
      throw new AppError(403, 'VOID_NOT_ALLOWED', 'Pengeluaran hari sebelumnya hanya bisa dibatalkan oleh admin.');
    }
    await client.query('UPDATE expenses SET voided_at = $2 WHERE id = $1', [id, now()]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

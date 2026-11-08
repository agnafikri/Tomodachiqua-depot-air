// Pencatatan air masuk, koreksi stok, dan konsumsi pribadi. Perhitungan sisa ada di stock.mjs.
import { pool, query } from '../db/pool.mjs';
import { AppError } from '../errors.mjs';
import { atDate, jakartaDate, now } from './clock.mjs';
import { getTankSettings } from './settings.mjs';

// Pencatatan ganda (tombol terketuk dua kali) dikenali lewat client_request_id.
async function insertOnce(table, columns, values, clientRequestId) {
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
     ON CONFLICT (client_request_id) DO NOTHING RETURNING id`,
    values,
  );
  if (rows[0]) return { id: Number(rows[0].id), duplicate: false };
  const existing = await query(`SELECT id FROM ${table} WHERE client_request_id = $1`, [clientRequestId]);
  return { id: Number(existing.rows[0].id), duplicate: true };
}

export async function addRefill({ refillDate, liters, note, clientRequestId }, user) {
  const { capacityLiters } = await getTankSettings();
  if (liters > capacityLiters) {
    throw new AppError(400, 'EXCEEDS_CAPACITY', `Air masuk tidak mungkin lebih dari kapasitas toren (${capacityLiters} liter).`);
  }
  const at = now();
  const date = refillDate ?? jakartaDate(at);
  return insertOnce(
    'tank_refills',
    ['refill_date', 'occurred_at', 'liters', 'note', 'created_by', 'created_at', 'client_request_id'],
    [date, atDate(date, at), liters, note ?? null, user.id, at, clientRequestId ?? null],
    clientRequestId,
  );
}

export async function addAdjustment({ litersAfter, note, clientRequestId }, user) {
  const { capacityLiters } = await getTankSettings();
  if (litersAfter > capacityLiters) {
    throw new AppError(400, 'EXCEEDS_CAPACITY', `Sisa air tidak mungkin lebih dari kapasitas toren (${capacityLiters} liter).`);
  }
  const at = now();
  return insertOnce(
    'tank_adjustments',
    ['adjusted_at', 'liters_after', 'note', 'created_by', 'created_at', 'client_request_id'],
    [at, litersAfter, note ?? null, user.id, at, clientRequestId ?? null],
    clientRequestId,
  );
}

export async function addPersonalUse({ useDate, gallons, note, clientRequestId }, user) {
  const at = now();
  const date = useDate ?? jakartaDate(at);
  return insertOnce(
    'personal_use',
    ['use_date', 'occurred_at', 'gallons', 'note', 'created_by', 'created_at', 'client_request_id'],
    [date, atDate(date, at), gallons, note ?? null, user.id, at, clientRequestId ?? null],
    clientRequestId,
  );
}

// Riwayat gabungan, terbaru di atas. canVoid: PEMILIK hanya untuk catatan yang dibuat hari ini; ADMIN kapan saja.
// Koreksi stok tidak bisa dibatalkan.
export async function listHistory(user, limit = 60) {
  const today = jakartaDate();
  const [refills, adjustments, personal] = await Promise.all([
    query(
      `SELECT r.id, r.occurred_at, r.liters, r.note, r.created_at, u.name AS by_name
       FROM tank_refills r JOIN users u ON u.id = r.created_by
       WHERE r.voided_at IS NULL ORDER BY r.occurred_at DESC, r.id DESC LIMIT $1`, [limit]),
    query(
      `SELECT a.id, a.adjusted_at, a.liters_after, a.note, a.created_at, u.name AS by_name
       FROM tank_adjustments a JOIN users u ON u.id = a.created_by
       ORDER BY a.adjusted_at DESC, a.id DESC LIMIT $1`, [limit]),
    query(
      `SELECT p.id, p.occurred_at, p.gallons, p.note, p.created_at, u.name AS by_name
       FROM personal_use p JOIN users u ON u.id = p.created_by
       WHERE p.voided_at IS NULL ORDER BY p.occurred_at DESC, p.id DESC LIMIT $1`, [limit]),
  ]);
  const canVoid = (createdAt) => user.role === 'ADMIN' || jakartaDate(createdAt) === today;

  const items = [
    ...refills.rows.map((r) => ({ type: 'REFILL', id: Number(r.id), at: r.occurred_at, liters: r.liters, note: r.note, byName: r.by_name, canVoid: canVoid(r.created_at) })),
    ...adjustments.rows.map((a) => ({ type: 'ADJUSTMENT', id: Number(a.id), at: a.adjusted_at, liters: a.liters_after, note: a.note, byName: a.by_name, canVoid: false })),
    ...personal.rows.map((p) => ({ type: 'PERSONAL', id: Number(p.id), at: p.occurred_at, gallons: p.gallons, note: p.note, byName: p.by_name, canVoid: canVoid(p.created_at) })),
  ];
  items.sort((a, b) => new Date(b.at) - new Date(a.at) || b.id - a.id);
  return items.slice(0, limit);
}

const VOIDABLE = { tank_refills: 'Catatan air masuk', personal_use: 'Catatan konsumsi pribadi' };

async function voidRecord(table, id, user) {
  const label = VOIDABLE[table];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT id, created_at, voided_at FROM ${table} WHERE id = $1 FOR UPDATE`, [id]);
    const row = rows[0];
    if (!row) throw new AppError(404, 'NOT_FOUND', `${label} tidak ditemukan.`);
    if (row.voided_at) throw new AppError(409, 'ALREADY_VOIDED', `${label} ini sudah dibatalkan.`);
    if (user.role !== 'ADMIN' && jakartaDate(row.created_at) !== jakartaDate()) {
      throw new AppError(403, 'VOID_NOT_ALLOWED', `${label} hari sebelumnya hanya bisa dibatalkan oleh admin.`);
    }
    await client.query(`UPDATE ${table} SET voided_at = $2 WHERE id = $1`, [id, now()]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export const voidRefill = (id, user) => voidRecord('tank_refills', id, user);
export const voidPersonalUse = (id, user) => voidRecord('personal_use', id, user);

// Upah harian dan slip. Tidak ada tarif tetap: nominal tiap karyawan ditentukan pemilik per hari.
// Upah dibayar tunai di hari yang sama dan otomatis menjadi pengeluaran di Keuangan (lihat reports.mjs);
// jangan mencatatnya lagi sebagai pengeluaran manual.
import { randomUUID } from 'node:crypto';
import { pool, query } from '../db/pool.mjs';
import { AppError } from '../errors.mjs';
import { jakartaDate, now } from './clock.mjs';

const TZ = 'Asia/Jakarta';

export function toSlip(r, user) {
  return {
    id: Number(r.id),
    employeeId: Number(r.employee_id),
    employeeName: r.employee_name,
    employeePhone: r.employee_phone ?? null,
    wageDate: r.wage_date,
    amount: r.amount,
    note: r.note,
    byName: r.by_name,
    createdAt: r.created_at,
    // PEMILIK hanya boleh membatalkan slip yang dicatat hari ini; ADMIN kapan saja.
    canVoid: user ? user.role === 'ADMIN' || jakartaDate(r.created_at) === jakartaDate() : undefined,
  };
}

const SLIP_SELECT = `
  SELECT w.id, w.employee_id, e.name AS employee_name, e.phone AS employee_phone,
         w.wage_date::text AS wage_date, w.amount, w.note, w.created_at, u.name AS by_name
  FROM wage_slips w
  JOIN employees e ON e.id = w.employee_id
  JOIN users u ON u.id = w.created_by`;

// Tampilan "Upah hari ini": acuan uang masuk, pengeluaran lain, daftar karyawan aktif dan slip yang sudah ada.
export async function getWageDay(date, user) {
  const today = jakartaDate();
  const day = date ?? today;

  const [cash, spent, slips, employees] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(amount), 0)::int AS total FROM payments
       WHERE voided_at IS NULL
         AND paid_at >= ($1::date)::timestamp AT TIME ZONE '${TZ}' AND paid_at < ($1::date + 1)::timestamp AT TIME ZONE '${TZ}'`,
      [day],
    ),
    query(`SELECT COALESCE(SUM(amount), 0)::int AS total FROM expenses WHERE voided_at IS NULL AND spent_date = $1::date`, [day]),
    query(`${SLIP_SELECT} WHERE w.voided_at IS NULL AND w.wage_date = $1::date ORDER BY w.id`, [day]),
    query('SELECT id, name, phone FROM employees WHERE is_active ORDER BY lower(name)'),
  ]);

  const slipList = slips.rows.map((r) => toSlip(r, user));
  const byEmployee = Object.fromEntries(slipList.map((s) => [s.employeeId, s]));
  const wagesTotal = slipList.reduce((s, x) => s + x.amount, 0);

  return {
    date: day,
    today,
    cashIn: cash.rows[0].total,
    expenses: spent.rows[0].total, // pengeluaran manual pada hari itu (belum termasuk upah)
    wagesPaid: wagesTotal,
    remaining: cash.rows[0].total - spent.rows[0].total - wagesTotal,
    employees: employees.rows.map((e) => ({ id: Number(e.id), name: e.name, phone: e.phone, slip: byEmployee[Number(e.id)] ?? null })),
    slips: slipList,
  };
}

// Membuat slip untuk beberapa karyawan sekaligus (satu transaksi). items = [{ employeeId, amount, note }].
export async function createWages({ wageDate, items, clientRequestId }, user) {
  const batchId = clientRequestId ?? randomUUID();
  const date = wageDate ?? jakartaDate();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [batchId]);

    const dup = await client.query('SELECT 1 FROM wage_slips WHERE batch_id = $1 LIMIT 1', [batchId]);
    if (dup.rowCount > 0) {
      await client.query('ROLLBACK');
      return { slips: await slipsOfBatch(batchId, user), duplicate: true };
    }

    const ids = items.map((i) => i.employeeId);
    const emps = await client.query('SELECT id, name, is_active FROM employees WHERE id = ANY($1::bigint[]) FOR SHARE', [ids]);
    const known = new Map(emps.rows.map((e) => [Number(e.id), e]));
    for (const id of ids) {
      const e = known.get(id);
      if (!e) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Karyawan tidak ditemukan.');
      if (!e.is_active) throw new AppError(400, 'EMPLOYEE_INACTIVE', `${e.name} sudah dinonaktifkan.`);
    }

    const existing = await client.query(
      'SELECT e.name FROM wage_slips w JOIN employees e ON e.id = w.employee_id WHERE w.employee_id = ANY($1::bigint[]) AND w.wage_date = $2::date AND w.voided_at IS NULL',
      [ids, date],
    );
    if (existing.rowCount > 0) {
      throw new AppError(409, 'WAGE_EXISTS', `Slip untuk ${existing.rows.map((r) => r.name).join(', ')} pada tanggal ini sudah ada.`);
    }

    const at = now();
    for (const it of items) {
      await client.query(
        'INSERT INTO wage_slips (employee_id, wage_date, amount, note, batch_id, created_by, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [it.employeeId, date, it.amount, it.note ?? null, batchId, user.id, at],
      );
    }
    await client.query('COMMIT');
    return { slips: await slipsOfBatch(batchId, user), duplicate: false };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // Dua permintaan berbeda membuat slip yang sama pada saat bersamaan.
    if (err.code === '23505') throw new AppError(409, 'WAGE_EXISTS', 'Slip untuk karyawan ini pada tanggal tersebut sudah ada.');
    throw err;
  } finally {
    client.release();
  }
}

async function slipsOfBatch(batchId, user) {
  const { rows } = await query(`${SLIP_SELECT} WHERE w.batch_id = $1 ORDER BY w.id`, [batchId]);
  return rows.map((r) => toSlip(r, user));
}

export async function listSlips({ from, to, employeeId }, user) {
  const params = [from, to];
  let extra = '';
  if (employeeId != null) {
    params.push(employeeId);
    extra = `AND w.employee_id = $${params.length}`;
  }
  const { rows } = await query(
    `${SLIP_SELECT} WHERE w.voided_at IS NULL AND w.wage_date BETWEEN $1::date AND $2::date ${extra}
     ORDER BY w.wage_date DESC, lower(e.name), w.id DESC LIMIT 500`,
    params,
  );
  const slips = rows.map((r) => toSlip(r, user));
  return { slips, total: slips.reduce((s, x) => s + x.amount, 0) };
}

export async function getSlip(id, user) {
  const { rows } = await query(`${SLIP_SELECT} WHERE w.id = $1 AND w.voided_at IS NULL`, [id]);
  if (!rows[0]) throw new AppError(404, 'SLIP_NOT_FOUND', 'Slip tidak ditemukan atau sudah dibatalkan.');
  return toSlip(rows[0], user);
}

export async function voidSlip(id, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id, created_at, voided_at FROM wage_slips WHERE id = $1 FOR UPDATE', [id]);
    const row = rows[0];
    if (!row) throw new AppError(404, 'SLIP_NOT_FOUND', 'Slip tidak ditemukan.');
    if (row.voided_at) throw new AppError(409, 'ALREADY_VOIDED', 'Slip ini sudah dibatalkan.');
    if (user.role !== 'ADMIN' && jakartaDate(row.created_at) !== jakartaDate()) {
      throw new AppError(403, 'VOID_NOT_ALLOWED', 'Slip hari sebelumnya hanya bisa dibatalkan oleh admin.');
    }
    await client.query('UPDATE wage_slips SET voided_at = $2 WHERE id = $1', [id, now()]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

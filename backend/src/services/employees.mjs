import { query } from '../db/pool.mjs';
import { AppError } from '../errors.mjs';

const COLUMNS = 'id, name, phone, is_active';

export const toEmployee = (r) => ({ id: Number(r.id), name: r.name, phone: r.phone, isActive: r.is_active });

// active = true | false | 'all'
export async function listEmployees({ active = 'all' } = {}) {
  const where = active === 'all' ? '' : 'WHERE is_active = $1';
  const { rows } = await query(`SELECT ${COLUMNS} FROM employees ${where} ORDER BY is_active DESC, lower(name)`, active === 'all' ? [] : [active]);
  return rows.map(toEmployee);
}

const mapError = (err) =>
  err.code === '23505' ? new AppError(409, 'DUPLICATE_NAME', 'Nama karyawan sudah ada. Tambahkan keterangan agar berbeda.') : err;

export async function createEmployee({ name, phone }) {
  try {
    const { rows } = await query(`INSERT INTO employees (name, phone) VALUES ($1, $2) RETURNING ${COLUMNS}`, [name, phone ?? null]);
    return toEmployee(rows[0]);
  } catch (err) {
    throw mapError(err);
  }
}

export async function updateEmployee(id, data) {
  const sets = [];
  const params = [];
  const set = (col, v) => {
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  };
  if (data.name !== undefined) set('name', data.name);
  if (data.phone !== undefined) set('phone', data.phone);
  if (data.isActive !== undefined) set('is_active', data.isActive);
  if (!sets.length) throw new AppError(400, 'NO_CHANGES', 'Tidak ada data yang diubah.');
  params.push(id);
  try {
    const { rows } = await query(
      `UPDATE employees SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length} RETURNING ${COLUMNS}`,
      params,
    );
    if (!rows[0]) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Karyawan tidak ditemukan.');
    return toEmployee(rows[0]);
  } catch (err) {
    throw mapError(err);
  }
}

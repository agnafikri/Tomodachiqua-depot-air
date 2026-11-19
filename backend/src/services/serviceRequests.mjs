// Permintaan layanan dari landing page publik. Disimpan apa adanya; ditindaklanjuti dari aplikasi.
import { query } from '../db/pool.mjs';
import { AppError } from '../errors.mjs';
import { now } from './clock.mjs';

export const AREAS = { BANDUNG: 'Kota Bandung', CIMAHI: 'Cimahi', LAINNYA: 'Daerah lain' };
export const SERVICE_TYPES = {
  PASANG: 'Pemasangan depot baru',
  SERVICE: 'Service berkala',
  PERBAIKAN: 'Perbaikan',
  KONSULTASI: 'Konsultasi atau survei',
};
export const STATUSES = { NEW: 'Baru', CONTACTED: 'Sudah dihubungi', SURVEY: 'Survei', DONE: 'Selesai', CANCELLED: 'Dibatalkan' };

const SELECT = `
  SELECT r.*, u.name AS updated_by_name
  FROM service_requests r LEFT JOIN users u ON u.id = r.updated_by`;

const toRequest = (r) => ({
  id: Number(r.id),
  name: r.name,
  phone: r.phone,
  area: r.area,
  areaLabel: AREAS[r.area],
  serviceType: r.service_type,
  serviceLabel: SERVICE_TYPES[r.service_type],
  address: r.address,
  message: r.message,
  status: r.status,
  statusLabel: STATUSES[r.status],
  internalNote: r.internal_note,
  createdAt: r.created_at,
  contactedAt: r.contacted_at,
  updatedAt: r.updated_at,
  updatedByName: r.updated_by_name ?? null,
});

export async function createRequest({ name, phone, area, serviceType, address, message, clientRequestId }, ipHash) {
  const at = now();
  const { rows } = await query(
    `INSERT INTO service_requests (name, phone, area, service_type, address, message, ip_hash, client_request_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
     ON CONFLICT (client_request_id) DO NOTHING RETURNING id`,
    [name, phone, area, serviceType, address ?? null, message ?? null, ipHash, clientRequestId ?? null, at],
  );
  return { id: rows[0] ? Number(rows[0].id) : null, duplicate: !rows[0] };
}

export async function listRequests({ status } = {}) {
  const params = [];
  const where = status ? (params.push(status), 'WHERE r.status = $1') : '';
  const [list, counts] = await Promise.all([
    query(`${SELECT} ${where} ORDER BY r.created_at DESC, r.id DESC LIMIT 500`, params),
    query('SELECT status, COUNT(*)::int AS n FROM service_requests GROUP BY status'),
  ]);
  const byStatus = Object.fromEntries(Object.keys(STATUSES).map((s) => [s, 0]));
  for (const c of counts.rows) byStatus[c.status] = c.n;
  return { requests: list.rows.map(toRequest), counts: { ...byStatus, total: Object.values(byStatus).reduce((a, b) => a + b, 0) } };
}

export async function countNew() {
  const { rows } = await query("SELECT COUNT(*)::int AS n FROM service_requests WHERE status = 'NEW'");
  return rows[0].n;
}

// Mengubah status dan/atau catatan internal. Saat status pertama kali beranjak dari Baru, waktu dihubungi dicatat.
export async function updateRequest(id, { status, internalNote }, user) {
  const sets = ['updated_at = $2', 'updated_by = $3'];
  const params = [id, now(), user.id];
  if (status !== undefined) {
    params.push(status);
    sets.push(`status = $${params.length}`);
    if (status !== 'NEW') sets.push('contacted_at = COALESCE(contacted_at, $2)');
  }
  if (internalNote !== undefined) {
    params.push(internalNote);
    sets.push(`internal_note = $${params.length}`);
  }
  if (status === undefined && internalNote === undefined) throw new AppError(400, 'NO_CHANGES', 'Tidak ada data yang diubah.');
  const { rowCount } = await query(`UPDATE service_requests SET ${sets.join(', ')} WHERE id = $1`, params);
  if (!rowCount) throw new AppError(404, 'REQUEST_NOT_FOUND', 'Permintaan tidak ditemukan.');
  const { rows } = await query(`${SELECT} WHERE r.id = $1`, [id]);
  return toRequest(rows[0]);
}

// Hapus permanen (mis. atas permintaan pengunjung untuk menghapus datanya). Khusus ADMIN.
export async function deleteRequest(id) {
  const { rowCount } = await query('DELETE FROM service_requests WHERE id = $1', [id]);
  if (!rowCount) throw new AppError(404, 'REQUEST_NOT_FOUND', 'Permintaan tidak ditemukan.');
}

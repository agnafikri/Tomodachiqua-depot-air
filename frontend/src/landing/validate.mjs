// Validasi formulir permintaan di sisi pengunjung. Server tetap yang menentukan (aturannya sama).
import { normalizePhone } from '../lib/phone.mjs';

export const AREAS = { BANDUNG: 'Kota Bandung', CIMAHI: 'Cimahi', LAINNYA: 'Daerah lain' };
export const SERVICE_TYPES = {
  PASANG: 'Pemasangan depot baru',
  SERVICE: 'Service berkala',
  PERBAIKAN: 'Perbaikan',
  KONSULTASI: 'Konsultasi atau survei',
};

// Mengembalikan objek { kolom: pesan } (kosong = valid).
export function validateRequest(v) {
  const errors = {};
  const name = (v.name ?? '').trim();
  if (name.length < 2) errors.name = 'Isi nama (minimal 2 huruf).';
  else if (name.length > 100) errors.name = 'Nama terlalu panjang.';
  if (!normalizePhone(v.phone)) errors.phone = 'Isi nomor WhatsApp yang aktif, mis. 0812 3456 7890.';
  if (!AREAS[v.area]) errors.area = 'Pilih area.';
  if (!SERVICE_TYPES[v.serviceType]) errors.serviceType = 'Pilih jenis layanan.';
  if ((v.address ?? '').trim().length > 300) errors.address = 'Alamat terlalu panjang (maksimal 300 karakter).';
  if ((v.message ?? '').trim().length > 1000) errors.message = 'Keterangan terlalu panjang (maksimal 1000 karakter).';
  return errors;
}

import { API_BASE, ApiError } from './api.mjs';

// Nama berkas dari header Content-Disposition (mendukung filename*= dan filename=).
export function fileNameFrom(header) {
  if (!header) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* lanjut ke filename= */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : null;
}

// Mengunduh berkas dari API (memakai cookie sesi), lalu memicu simpan di browser.
export async function downloadFile(path) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { credentials: 'include', headers: { 'X-Requested-With': 'tomodachiqua' } });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Tidak bisa terhubung ke server. Periksa koneksi internet lalu coba lagi.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? 'Gagal mengunduh berkas.');
  }
  const blob = await res.blob();
  const name = fileNameFrom(res.headers.get('Content-Disposition')) ?? 'unduhan.xlsx';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

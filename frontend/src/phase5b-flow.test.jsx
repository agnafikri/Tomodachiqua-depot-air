// Menguji layar Permintaan layanan (aplikasi) dan pemberitahuan di Beranda.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';

const ADMIN = { id: 1, name: 'Agna', username: 'admin', role: 'ADMIN' };
const PEMILIK = { id: 2, name: 'Abah', username: 'abah', role: 'PEMILIK' };

let user;
let urls;
let calls;
let requests;
let newCount;

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const req = (over = {}) => ({
  id: 1, name: 'Bu Rina', phone: '6281234567890', area: 'BANDUNG', areaLabel: 'Kota Bandung', serviceType: 'PASANG', serviceLabel: 'Pemasangan depot baru',
  address: 'Jl. Contoh No. 1, Coblong', message: 'Mau pasang depot baru di rumah.', status: 'NEW', statusLabel: 'Baru', internalNote: null,
  createdAt: '2026-11-12T03:00:00Z', contactedAt: null, updatedAt: '2026-11-12T03:00:00Z', updatedByName: null, ...over,
});

beforeEach(() => {
  user = PEMILIK;
  urls = [];
  calls = [];
  newCount = 2;
  requests = [
    req(),
    req({ id: 2, name: 'Pak Dedi', area: 'CIMAHI', areaLabel: 'Cimahi', serviceType: 'SERVICE', serviceLabel: 'Service berkala', message: null, status: 'SURVEY', statusLabel: 'Survei', internalNote: 'Survei Sabtu', contactedAt: '2026-11-12T05:00:00Z' }),
  ];

  vi.stubGlobal(
    'fetch',
    vi.fn((url, opts = {}) => {
      const path = String(url).replace(/^.*\/api/, '/api');
      const method = opts.method || 'GET';
      const body = opts.body ? JSON.parse(opts.body) : null;
      if (method === 'GET') urls.push(path);
      else calls.push([method, path, body]);

      if (path === '/api/auth/me') return json(200, { user });
      if (path === '/api/service-requests' || path.startsWith('/api/service-requests?')) {
        const status = new URL(`http://x${path}`).searchParams.get('status');
        const list = status ? requests.filter((r) => r.status === status) : requests;
        return json(200, { requests: list, counts: { NEW: 1, CONTACTED: 0, SURVEY: 1, DONE: 0, CANCELLED: 0, total: 2 } });
      }
      if (path.startsWith('/api/service-requests/') && method === 'PATCH') return json(200, { request: req({ ...body }) });
      if (path.startsWith('/api/service-requests/') && method === 'DELETE') return json(200, { ok: true });
      if (path === '/api/summary') {
        return json(200, { today: '2026-11-12', orders: { orderCount: 1, gallons: 2, total: 12000 }, totalDebt: 0, tank: { known: false, level: 'UNKNOWN', capacityLiters: 6000 }, serviceRequests: { new: newCount } });
      }
      return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderApp(path) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Beranda', () => {
  it('menampilkan jumlah permintaan layanan baru dengan tautan ke layar Layanan', async () => {
    renderApp('/');
    const link = await screen.findByRole('link', { name: /2 permintaan layanan baru/ });
    expect(link.getAttribute('href')).toBe('/layanan');
  });

  it('tidak tampil bila tidak ada yang baru', async () => {
    newCount = 0;
    renderApp('/');
    await screen.findByText('Order hari ini');
    expect(screen.queryByText(/permintaan layanan baru/)).toBeNull();
  });
});

describe('layar Layanan', () => {
  it('daftar permintaan dengan status, jenis layanan, area, dan jumlah per status', async () => {
    renderApp('/layanan');
    expect(await screen.findByText('Bu Rina')).toBeTruthy();
    expect(screen.getByText('Pemasangan depot baru · Kota Bandung')).toBeTruthy();
    expect(screen.getByText('Mau pasang depot baru di rumah.')).toBeTruthy();
    expect(screen.getByText('Pak Dedi')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Semua (2)' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Baru (1)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Selesai (0)' })).toBeTruthy();
  });

  it('menyaring berdasarkan status', async () => {
    renderApp('/layanan');
    await screen.findByText('Bu Rina');
    fireEvent.click(screen.getByRole('button', { name: 'Survei (1)' }));
    await waitFor(() => expect(urls).toContain('/api/service-requests?status=SURVEY'));
    await waitFor(() => expect(screen.queryByText('Bu Rina')).toBeNull());
    expect(screen.getByText('Pak Dedi')).toBeTruthy();
  });

  it('kosong: pesan yang menjelaskan asal permintaan', async () => {
    requests = [];
    renderApp('/layanan');
    expect(await screen.findByText(/Belum ada permintaan layanan/)).toBeTruthy();
  });

  it('detail: data pengunjung, tautan WhatsApp berisi pesan sambutan, telepon, dan catatan', async () => {
    renderApp('/layanan');
    fireEvent.click(await screen.findByRole('button', { name: /Bu Rina/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Bu Rina' });
    expect(within(dialog).getByText('Jl. Contoh No. 1, Coblong')).toBeTruthy();
    expect(within(dialog).getByText('Mau pasang depot baru di rumah.')).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: '+6281234567890' }).getAttribute('href')).toBe('tel:+6281234567890');
    const wa = within(dialog).getByRole('link', { name: 'Hubungi via WhatsApp' });
    expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/6281234567890\?text=/);
    expect(decodeURIComponent(wa.getAttribute('href'))).toContain('Halo Bu Rina');
    expect(decodeURIComponent(wa.getAttribute('href'))).toContain('pemasangan depot baru');
    expect(wa.getAttribute('target')).toBe('_blank');
    expect(wa.getAttribute('rel')).toContain('noopener');
  });

  it('mengubah status dan catatan internal', async () => {
    renderApp('/layanan');
    fireEvent.click(await screen.findByRole('button', { name: /Bu Rina/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Status'), { target: { value: 'CONTACTED' } });
    fireEvent.change(within(dialog).getByLabelText(/Catatan internal/), { target: { value: 'Sudah ditelepon' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan' }));
    expect(await within(dialog).findByText('Perubahan tersimpan.')).toBeTruthy();
    expect(calls.find(([m, p]) => m === 'PATCH' && p === '/api/service-requests/1')[2]).toEqual({ status: 'CONTACTED', internalNote: 'Sudah ditelepon' });
  });

  it('PEMILIK tidak melihat tombol hapus permanen; ADMIN melihatnya dan harus mengonfirmasi', async () => {
    renderApp('/layanan');
    fireEvent.click(await screen.findByRole('button', { name: /Bu Rina/ }));
    const d1 = await screen.findByRole('dialog');
    expect(within(d1).queryByRole('button', { name: 'Hapus permanen' })).toBeNull();
    cleanup();

    user = ADMIN;
    renderApp('/layanan');
    fireEvent.click(await screen.findByRole('button', { name: /Bu Rina/ }));
    const d2 = await screen.findByRole('dialog');
    const hapus = within(d2).getByRole('button', { name: 'Hapus permanen' });
    expect(hapus.className).toMatch(/border-danger/);
    fireEvent.click(hapus);
    expect(within(d2).getByText(/tidak bisa dikembalikan/)).toBeTruthy();
    fireEvent.click(within(d2).getByRole('button', { name: 'Ya, hapus' }));
    await waitFor(() => expect(calls.some(([m, p]) => m === 'DELETE' && p === '/api/service-requests/1')).toBe(true));
  });

  it('menu Layanan ada di navigasi untuk kedua peran', async () => {
    renderApp('/');
    const links = await screen.findAllByRole('link', { name: /^Layanan/ });
    expect(links.some((l) => l.getAttribute('href') === '/layanan')).toBe(true);
    cleanup();
    user = ADMIN;
    renderApp('/');
    expect((await screen.findAllByRole('link', { name: /^Layanan/ })).some((l) => l.getAttribute('href') === '/layanan')).toBe(true);
  });
});

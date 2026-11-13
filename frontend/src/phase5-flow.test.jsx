// Menguji halaman Impor dan ekspor, tombol Unduh Excel, dan riwayat impor di React sungguhan (jsdom).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { fileNameFrom } from './lib/download.mjs';

const ADMIN = { id: 1, name: 'Agna', username: 'admin', role: 'ADMIN' };
const PEMILIK = { id: 2, name: 'Abah', username: 'abah', role: 'PEMILIK' };
const TODAY = '2026-11-08';

let user;
let urls; // GET
let calls; // [method, path, body(FormData|object)]
let checkResult;
let batches;
let downloadFails;
let clicked; // anchor yang diklik untuk mengunduh

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body), headers: { get: () => 'application/json' } });
const fileResponse = (name) =>
  Promise.resolve({
    ok: true, status: 200, headers: { get: (h) => (h.toLowerCase() === 'content-disposition' ? `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}` : null) },
    blob: () => Promise.resolve(new Blob(['x'])),
  });

const okResult = (over = {}) => ({
  kind: 'ORDERS', label: 'Order lama', fileName: 'order.xlsx', rowCount: 5, validCount: 5, errorCount: 0, errors: [], errorsTruncated: false,
  warnings: ['4 order bertanggal setelah koreksi stok terakhir, sehingga akan mengurangi hitungan stok toren.'],
  summary: { count: 5, gallons: 31, totalValue: 139000, paidAtOrder: 67000, unpaid: 72000, paidCount: 2, debtCount: 3, dateFrom: '2026-09-01', dateTo: '2026-09-04', afterLastAdjustment: 4 },
  preview: [{ date: '2026-09-01', time: '09:30', customer: 'Warung Bu Ani', qty: 20, isDelivered: true, unitPrice: 4500, freeQty: 2, total: 81000, status: 'DEBT', paid: 40000, note: null }],
  alreadyImported: null, canCommit: true, ...over,
});

beforeEach(() => {
  user = ADMIN;
  urls = [];
  calls = [];
  downloadFails = false;
  clicked = [];
  checkResult = okResult();
  batches = [
    { id: 7, kind: 'ORDERS', kindLabel: 'Order lama', fileName: 'order-lama.xlsx', rowCount: 120, summary: {}, byName: 'Agna', createdAt: '2026-11-07T03:00:00Z', voidedAt: null },
    { id: 6, kind: 'CUSTOMERS', kindLabel: 'Pelanggan', fileName: 'pelanggan.xlsx', rowCount: 30, summary: {}, byName: 'Agna', createdAt: '2026-11-06T03:00:00Z', voidedAt: '2026-11-06T04:00:00Z' },
  ];

  globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
  globalThis.URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
    clicked.push({ href: this.href, download: this.download });
  });

  vi.stubGlobal(
    'fetch',
    vi.fn((url, opts = {}) => {
      const path = String(url).replace(/^.*\/api/, '/api');
      const method = opts.method || 'GET';
      if (method === 'GET') urls.push(path);
      else calls.push([method, path, opts.body]);

      if (path === '/api/auth/me') return json(200, { user });
      if (path.startsWith('/api/export/') || path.startsWith('/api/import/templates/')) {
        if (downloadFails) return json(500, { error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan di server.' } });
        const name = path.includes('backup') ? 'cadangan-tomodachiqua-2026-11-08.xlsx' : path.includes('templates') ? `template-${path.split('/').pop()}.xlsx` : 'laporan-bulanan-2026-11.xlsx';
        return fileResponse(name);
      }
      if (path === '/api/import/batches' && method === 'GET') return json(200, { batches });
      if (path.startsWith('/api/import/batches/') && method === 'PATCH') return json(200, { kind: 'ORDERS', voidedOrders: 120, voidedExpenses: 0 });
      if (path.endsWith('/check') && method === 'POST') return json(200, { result: checkResult });
      if (path.startsWith('/api/import/') && method === 'POST') return json(201, { import: { batchId: 8, kind: 'ORDERS', imported: 5, summary: {} } });

      if (path.startsWith('/api/reports')) {
        const q = new URL(`http://x${path}`).searchParams;
        return json(200, {
          period: q.get('period'), today: TODAY, range: { from: TODAY, to: TODAY }, prevDate: '2026-11-07', nextDate: null, includesToday: true,
          totals: { orderCount: 1, gallons: 2, freeGallons: 0, deliveredGallons: 2, pickupGallons: 0, sales: 12000, cashIn: 12000, cashInAtOrder: 12000, debtPayments: 0, newDebt: 0, waived: 0, personalGallons: 0, wages: 0, expenses: 0, balance: 12000 },
          days: [],
        });
      }
      return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderApp(path = '/admin/impor-ekspor') {
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

const pickFile = (name = 'order.xlsx', size = 2048) => {
  const input = screen.getByLabelText('Pilih berkas Excel');
  const file = new File([new Uint8Array(size)], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
};

describe('akses halaman', () => {
  it('PEMILIK tidak bisa membuka halaman impor dan ekspor', async () => {
    user = PEMILIK;
    renderApp();
    expect(await screen.findByText('Halaman ini khusus admin')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Periksa file/ })).toBeNull();
  });

  it('ADMIN melihat bagian ekspor, impor, dan riwayat', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Ekspor ke Excel' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Impor dari Excel' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Riwayat impor' })).toBeTruthy();
  });
});

describe('unduh', () => {
  it('nama berkas dibaca dari header Content-Disposition', () => {
    expect(fileNameFrom('attachment; filename="a.xlsx"; filename*=UTF-8\'\'a%20b.xlsx')).toBe('a b.xlsx');
    expect(fileNameFrom('attachment; filename="plain.xlsx"')).toBe('plain.xlsx');
    expect(fileNameFrom(null)).toBeNull();
  });

  it('cadangan lengkap: memanggil API dan memicu simpan berkas dengan nama dari server', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /Unduh cadangan lengkap/ }));
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(urls).toContain('/api/export/backup.xlsx');
    expect(clicked[0].download).toBe('cadangan-tomodachiqua-2026-11-08.xlsx');
    expect(await screen.findByText(/cadangan-tomodachiqua-2026-11-08\.xlsx diunduh/)).toBeTruthy();
  });

  it('laporan periode memakai periode dan tanggal yang dipilih', async () => {
    renderApp();
    await screen.findByRole('heading', { name: 'Ekspor ke Excel' });
    fireEvent.click(screen.getAllByRole('radio', { name: 'Mingguan' })[0]);
    fireEvent.change(screen.getByLabelText(/Tanggal acuan/), { target: { value: '2026-11-03' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unduh laporan Excel' }));
    await waitFor(() => expect(urls).toContain('/api/export/report.xlsx?period=weekly&date=2026-11-03'));
  });

  it('galat server tampil sebagai pesan, bukan berkas rusak', async () => {
    downloadFails = true;
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /Unduh cadangan lengkap/ }));
    expect(await screen.findByText('Terjadi kesalahan di server.')).toBeTruthy();
    expect(clicked).toHaveLength(0);
  });

  it('template mengikuti jenis data yang dipilih', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: 'Unduh template Pelanggan' }));
    await waitFor(() => expect(urls).toContain('/api/import/templates/pelanggan'));
    fireEvent.click(screen.getByRole('radio', { name: 'Order lama' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unduh template Order lama' }));
    await waitFor(() => expect(urls).toContain('/api/import/templates/order'));
  });
});

describe('tombol Unduh Excel di Laporan', () => {
  it('PEMILIK boleh mengunduh laporan periode yang sedang tampil', async () => {
    user = PEMILIK;
    renderApp('/laporan');
    fireEvent.click(await screen.findByRole('button', { name: 'Unduh Excel' }));
    await waitFor(() => expect(urls).toContain(`/api/export/report.xlsx?period=daily&date=${TODAY}`));
    expect(clicked[0].download).toBe('laporan-bulanan-2026-11.xlsx');
  });
});

describe('impor', () => {
  it('periksa file: mengirim berkas sebagai FormData; Simpan aktif hanya bila siap', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('radio', { name: 'Order lama' }));
    const check = screen.getByRole('button', { name: /Periksa file/ });
    expect(check.disabled).toBe(true);

    const file = pickFile('order.xlsx');
    expect(screen.getByText(/order\.xlsx · 2 KB/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Periksa file/ }));

    expect(await screen.findByText('5 baris dibaca · 5 valid · 0 bermasalah')).toBeTruthy();
    const post = calls.find(([m, p]) => m === 'POST' && p === '/api/import/order/check');
    expect(post[2]).toBeInstanceOf(FormData);
    expect(post[2].get('file').name).toBe(file.name);
    expect(screen.getByText(/5 order · 31 galon · nilai Rp 139\.000/)).toBeTruthy();
    expect(screen.getByText(/menjadi utang Rp 72\.000/)).toBeTruthy();
    expect(screen.getByText(/4 order bertanggal setelah koreksi stok/)).toBeTruthy(); // peringatan
    expect(screen.getByText('Warung Bu Ani')).toBeTruthy(); // pratinjau
    expect(screen.getByText('Rp 81.000')).toBeTruthy();
    expect(screen.getByText(/Berkas siap diimpor/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Simpan impor' }).disabled).toBe(false);
  });

  it('simpan: mengirim berkas yang sama, menampilkan hasil, dan mengosongkan pilihan', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('radio', { name: 'Order lama' }));
    pickFile('order.xlsx');
    fireEvent.click(screen.getByRole('button', { name: /Periksa file/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Simpan impor' }));
    expect(await screen.findByText('5 baris berhasil diimpor.')).toBeTruthy();
    const post = calls.find(([m, p]) => m === 'POST' && p === '/api/import/order');
    expect(post[2].get('file').name).toBe('order.xlsx');
    expect(screen.queryByRole('button', { name: 'Simpan impor' })).toBeNull(); // hasil dibersihkan
    expect(screen.getByRole('button', { name: /Periksa file/ }).disabled).toBe(true);
  });

  it('galat per baris tampil rapi dan Simpan tetap mati', async () => {
    checkResult = okResult({
      rowCount: 3, validCount: 1, errorCount: 2, canCommit: false, warnings: [],
      errors: [
        { row: 3, column: 'Pelanggan', message: 'Pelanggan "Bu Ani" belum ada. Impor template Pelanggan dulu, atau kosongkan untuk pelanggan umum.' },
        { row: 5, column: 'Dibayar', message: 'Harus kurang dari total (Rp 6000).' },
      ],
    });
    renderApp();
    fireEvent.click(await screen.findByRole('radio', { name: 'Order lama' }));
    pickFile();
    fireEvent.click(screen.getByRole('button', { name: /Periksa file/ }));
    const region = await screen.findByRole('region', { name: 'Galat per baris' });
    expect(within(region).getByText('Baris 3 · Pelanggan')).toBeTruthy();
    expect(within(region).getByText(/Impor template Pelanggan dulu/)).toBeTruthy();
    expect(within(region).getByText('Baris 5 · Dibayar')).toBeTruthy();
    expect(within(region).getByText('Harus kurang dari total (Rp 6000).')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Simpan impor' }).disabled).toBe(true);
    expect(screen.getByText(/aktif setelah semua galat diperbaiki/)).toBeTruthy();
    expect(screen.getByText('3 baris dibaca · 1 valid · 2 bermasalah')).toBeTruthy();
  });

  it('berkas yang sama sudah pernah diimpor: peringatan dan Simpan mati', async () => {
    checkResult = okResult({ alreadyImported: { id: 7, at: '2026-11-07T03:00:00Z' }, canCommit: false });
    renderApp();
    fireEvent.click(await screen.findByRole('radio', { name: 'Order lama' }));
    pickFile();
    fireEvent.click(screen.getByRole('button', { name: /Periksa file/ }));
    expect(await screen.findByText(/sudah pernah diimpor pada/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Simpan impor' }).disabled).toBe(true);
  });

  it('mengganti jenis data atau berkas membersihkan hasil pemeriksaan', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('radio', { name: 'Order lama' }));
    pickFile();
    fireEvent.click(screen.getByRole('button', { name: /Periksa file/ }));
    await screen.findByText('5 baris dibaca · 5 valid · 0 bermasalah');
    pickFile('lain.xlsx');
    expect(screen.queryByText('5 baris dibaca · 5 valid · 0 bermasalah')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Periksa file/ }));
    await screen.findByText('5 baris dibaca · 5 valid · 0 bermasalah');
    fireEvent.click(screen.getByRole('radio', { name: 'Pengeluaran' }));
    expect(screen.queryByText('5 baris dibaca · 5 valid · 0 bermasalah')).toBeNull();
    expect(screen.getByRole('button', { name: /Periksa file/ }).disabled).toBe(true);
  });

  it('galat berkas (bukan template) dari server tampil sebagai pesan', async () => {
    globalThis.fetch.mockImplementationOnce(() => json(200, { user }));
    renderApp();
    fireEvent.click(await screen.findByRole('radio', { name: 'Pengeluaran' }));
    pickFile();
    const base = globalThis.fetch.getMockImplementation();
    globalThis.fetch.mockImplementation((url, opts = {}) =>
      String(url).endsWith('/check') ? json(400, { error: { code: 'WRONG_TEMPLATE', message: 'Kolom wajib tidak ditemukan: Kategori.' } }) : base(url, opts),
    );
    fireEvent.click(screen.getByRole('button', { name: /Periksa file/ }));
    expect(await screen.findByText('Kolom wajib tidak ditemukan: Kategori.')).toBeTruthy();
  });
});

describe('riwayat impor', () => {
  it('daftar menandai yang dibatalkan; batalkan dengan konfirmasi', async () => {
    renderApp();
    expect(await screen.findByText('Order lama · 120 baris')).toBeTruthy();
    expect(screen.getByText('Dibatalkan')).toBeTruthy();
    const batal = screen.getAllByRole('button', { name: 'Batalkan impor' });
    expect(batal).toHaveLength(1); // yang sudah dibatalkan tidak punya tombol
    expect(batal[0].className).toMatch(/border-danger/);
    fireEvent.click(batal[0]);
    expect(screen.getByText(/Pelanggan yang sudah diimpor tidak dihapus/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ya, batalkan impor' }));
    await waitFor(() => expect(calls.some(([m, p]) => m === 'PATCH' && p === '/api/import/batches/7')).toBe(true));
    expect(await screen.findByText('Impor dibatalkan: 120 order dan 0 pengeluaran ditandai batal.')).toBeTruthy();
  });
});

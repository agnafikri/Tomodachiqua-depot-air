// Menguji layar Laporan dan Keuangan di React sungguhan (jsdom) dengan backend palsu.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';

const PEMILIK = { id: 2, name: 'Abah', username: 'abah', role: 'PEMILIK' };
const TODAY = '2026-11-08';

let urls; // semua GET yang diminta
let calls; // [method, path, body] untuk POST/PATCH
let failNextExpense;
let expenses;

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

// Hanya kasus yang dipakai tes; perhitungan sebenarnya ada di server.
function periodInfo(period, date) {
  const d = date ?? TODAY;
  if (period === 'daily') return { range: { from: d, to: d }, prevDate: '2026-11-06', nextDate: d === TODAY ? null : '2026-11-08', includesToday: d === TODAY };
  if (period === 'weekly') return { range: { from: '2026-11-02', to: '2026-11-08' }, prevDate: '2026-10-26', nextDate: null, includesToday: true };
  return { range: { from: '2026-11-01', to: '2026-11-30' }, prevDate: '2026-10-01', nextDate: null, includesToday: true };
}

const totals = {
  orderCount: 5, gallons: 22, freeGallons: 2, deliveredGallons: 20, pickupGallons: 2, sales: 109000,
  cashIn: 88000, cashInAtOrder: 55000, debtPayments: 33000, newDebt: 54000, waived: 1000, personalGallons: 3,
  expenses: 70000, balance: 18000,
};

beforeEach(() => {
  urls = [];
  calls = [];
  failNextExpense = false;
  expenses = [
    { id: 1, spentDate: '2026-11-08', category: 'LISTRIK', categoryLabel: 'Listrik', amount: 50000, note: 'token', byName: 'Abah', canVoid: true },
    { id: 2, spentDate: '2026-11-05', category: 'GALON', categoryLabel: 'Galon dan segel', amount: 20000, note: null, byName: 'Abah', canVoid: false },
  ];

  vi.stubGlobal(
    'fetch',
    vi.fn((url, opts = {}) => {
      const path = String(url).replace(/^.*\/api/, '/api');
      const method = opts.method || 'GET';
      const body = opts.body ? JSON.parse(opts.body) : null;
      if (method === 'GET') urls.push(path);
      else calls.push([method, path, body]);

      if (path === '/api/auth/me') return json(200, { user: PEMILIK });
      const q = new URL(`http://x${path}`).searchParams;

      if (path.startsWith('/api/reports')) {
        const info = periodInfo(q.get('period'), q.get('date'));
        const days = [
          { date: '2026-11-07', orderCount: 3, gallons: 16, sales: 73000, cashIn: 55000, expenses: 50000 },
          { date: '2026-11-08', orderCount: 0, gallons: 0, sales: 0, cashIn: 0, expenses: 0 },
        ];
        return json(200, { period: q.get('period'), today: TODAY, ...info, totals, days });
      }
      if (path.startsWith('/api/finance')) {
        const info = periodInfo(q.get('period'), q.get('date'));
        return json(200, {
          period: q.get('period'), today: TODAY, ...info,
          income: { total: 88000, atOrder: 55000, debtPayments: 33000 }, waived: 1000,
          expenses: { total: 70000, byCategory: [
            { category: 'LISTRIK', label: 'Listrik', amount: 50000, count: 1, percent: 71 },
            { category: 'GALON', label: 'Galon dan segel', amount: 20000, count: 1, percent: 29 },
          ] },
          balance: 18000,
          categories: [{ code: 'LISTRIK', label: 'Listrik' }, { code: 'GALON', label: 'Galon dan segel' }, { code: 'LAIN', label: 'Lain-lain' }],
        });
      }
      if (path.startsWith('/api/expenses') && method === 'GET') return json(200, { range: periodInfo('daily').range, items: expenses });
      if (path === '/api/expenses' && method === 'POST') {
        if (failNextExpense) {
          failNextExpense = false;
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        return json(201, { id: 9, duplicate: false });
      }
      if (path.startsWith('/api/expenses/') && method === 'PATCH') return json(200, { ok: true });
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

describe('layar Laporan', () => {
  it('hari ini menurut server: angka utama, penjualan, utang, dan kas', async () => {
    renderApp('/laporan');
    expect((await screen.findAllByText('Rp 88.000')).length).toBeGreaterThan(0); // uang masuk (angka utama; juga di kartu kas)
    expect(urls).toContain('/api/reports?period=daily'); // tanpa tanggal: server yang menentukan "hari ini"
    expect(screen.getByText(/Dibayar saat order Rp 55\.000 · pembayaran utang Rp 33\.000/)).toBeTruthy();
    expect(screen.getByText('Rp 109.000')).toBeTruthy(); // nilai penjualan
    expect(screen.getByText('22')).toBeTruthy(); // galon terjual
    expect(screen.getByText('20 galon')).toBeTruthy(); // diantar
    expect(screen.getByText('Rp 54.000')).toBeTruthy(); // utang baru
    expect(screen.getByText('Rp 33.000')).toBeTruthy(); // pelunasan
    expect(screen.getByText('Rp 18.000')).toBeTruthy(); // saldo
    expect(screen.getByText('Hari ini')).toBeTruthy();
    expect(screen.queryByText('Rincian per hari')).toBeNull(); // harian tidak punya rincian
    expect(screen.getByRole('button', { name: 'Periode berikutnya' }).disabled).toBe(true);
  });

  it('tombol sebelumnya meminta tanggal dari server; berikutnya aktif di periode lampau', async () => {
    renderApp('/laporan');
    await screen.findAllByText('Rp 88.000');
    fireEvent.click(screen.getByRole('button', { name: 'Periode sebelumnya' }));
    await waitFor(() => expect(urls).toContain('/api/reports?period=daily&date=2026-11-06'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Periode berikutnya' }).disabled).toBe(false));
    expect(screen.queryByText('Hari ini')).toBeNull();
  });

  it('mingguan: rincian per hari tampil dengan label rentang', async () => {
    renderApp('/laporan');
    await screen.findAllByText('Rp 88.000');
    fireEvent.click(screen.getByRole('radio', { name: 'Mingguan' }));
    expect(await screen.findByText('Rincian per hari')).toBeTruthy();
    expect(urls).toContain('/api/reports?period=weekly');
    expect(screen.getByText('16 galon · 3 order')).toBeTruthy();
    expect(screen.getByText(/2 Nov – 8 Nov 2026/)).toBeTruthy();
    expect(screen.getByText('Minggu ini')).toBeTruthy();
  });

  it('bulanan memakai label bulan', async () => {
    renderApp('/laporan');
    await screen.findAllByText('Rp 88.000');
    fireEvent.click(screen.getByRole('radio', { name: 'Bulanan' }));
    expect(await screen.findByText('November 2026')).toBeTruthy();
    expect(screen.getByText('Bulan ini')).toBeTruthy();
  });
});

describe('layar Keuangan', () => {
  it('pemasukan, pengeluaran, saldo, rincian kategori, dan catatan keringanan', async () => {
    renderApp('/keuangan');
    expect(await screen.findByText('Pemasukan')).toBeTruthy();
    expect(screen.getAllByText('Rp 88.000').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rp 70.000').length).toBeGreaterThan(0);
    expect(screen.getByText('Saldo')).toBeTruthy();
    expect(screen.getByText(/Keringanan utang Rp 1\.000 tidak dihitung sebagai pemasukan/)).toBeTruthy();
    expect(screen.getByText('71% · 1 catatan')).toBeTruthy();
    expect(await screen.findByText('Daftar pengeluaran')).toBeTruthy();
  });

  it('daftar pengeluaran: tombol batalkan hanya pada yang boleh, dengan konfirmasi', async () => {
    renderApp('/keuangan');
    await screen.findByText('“token”');
    const batal = screen.getAllByRole('button', { name: 'Batalkan' });
    expect(batal).toHaveLength(1); // yang kedua tidak boleh dibatalkan pemilik
    expect(batal[0].className).toMatch(/border-danger/);
    fireEvent.click(batal[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Ya, batalkan' }));
    await waitFor(() => expect(calls.some(([m, p]) => m === 'PATCH' && p === '/api/expenses/1')).toBe(true));
  });

  it('catat pengeluaran: validasi, tanggal bawaan dari server, lalu tersimpan', async () => {
    renderApp('/keuangan');
    fireEvent.click(await screen.findByRole('button', { name: 'Catat pengeluaran' }));
    const dialog = await screen.findByRole('dialog', { name: 'Catat pengeluaran' });
    expect(within(dialog).getByLabelText('Tanggal').value).toBe(TODAY);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan pengeluaran' }));
    expect(await within(dialog).findByText('Pilih kategori pengeluaran.')).toBeTruthy();
    expect(within(dialog).getByText('Isi jumlah pengeluaran.')).toBeTruthy();
    expect(calls).toHaveLength(0);

    fireEvent.change(within(dialog).getByLabelText('Kategori'), { target: { value: 'LISTRIK' } });
    fireEvent.change(within(dialog).getByLabelText('Jumlah (Rp)'), { target: { value: '50000' } });
    fireEvent.change(within(dialog).getByLabelText(/Catatan/), { target: { value: 'token listrik' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan pengeluaran' }));

    expect(await screen.findByText('Pengeluaran tersimpan.')).toBeTruthy();
    const post = calls.find(([m, p]) => m === 'POST' && p === '/api/expenses');
    expect(post[2]).toMatchObject({ category: 'LISTRIK', amount: 50000, spentDate: TODAY, note: 'token listrik' });
    expect(post[2].clientRequestId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('gagal kirim lalu dicoba lagi memakai clientRequestId yang sama', async () => {
    failNextExpense = true;
    renderApp('/keuangan');
    fireEvent.click(await screen.findByRole('button', { name: 'Catat pengeluaran' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Kategori'), { target: { value: 'GALON' } });
    fireEvent.change(within(dialog).getByLabelText('Jumlah (Rp)'), { target: { value: '20000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan pengeluaran' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan pengeluaran' }));
    expect(await screen.findByText('Pengeluaran tersimpan.')).toBeTruthy();
    const posts = calls.filter(([m, p]) => m === 'POST' && p === '/api/expenses');
    expect(posts).toHaveLength(2);
    expect(posts[1][2].clientRequestId).toBe(posts[0][2].clientRequestId);
  });
});

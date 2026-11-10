// Menguji layar Upah, kelola karyawan, riwayat slip, dan slip cetak di React sungguhan (jsdom).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';

const PEMILIK = { id: 2, name: 'Abah', username: 'abah', role: 'PEMILIK' };
const TODAY = '2026-11-08';

let urls;
let calls;
let employees;
let daySlips;
let failNextWage;
let wageError;
let employeeError;

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

const slipOf = (over = {}) => ({
  id: 31, employeeId: 1, employeeName: 'Budi', employeePhone: '0812', wageDate: TODAY, amount: 80000, note: 'ramai hari ini',
  byName: 'Abah', createdAt: '2026-11-08T10:00:00Z', canVoid: true, ...over,
});

beforeEach(() => {
  urls = [];
  calls = [];
  failNextWage = false;
  wageError = null;
  employeeError = null;
  employees = [
    { id: 1, name: 'Budi', phone: '0812', isActive: true },
    { id: 2, name: 'Sari', phone: null, isActive: true },
    { id: 3, name: 'Doni', phone: null, isActive: false },
  ];
  daySlips = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((url, opts = {}) => {
      const path = String(url).replace(/^.*\/api/, '/api');
      const method = opts.method || 'GET';
      const body = opts.body ? JSON.parse(opts.body) : null;
      if (method === 'GET') urls.push(path);
      else calls.push([method, path, body]);
      const q = new URL(`http://x${path}`).searchParams;

      if (path === '/api/auth/me') return json(200, { user: PEMILIK });

      if (path.startsWith('/api/wages/slips/') && method === 'GET') return json(200, { slip: slipOf({ id: Number(path.split('/').pop()) }) });
      if (path.startsWith('/api/wages/slips/') && method === 'PATCH') return json(200, { ok: true });
      if (path.startsWith('/api/wages/slips') && method === 'GET') {
        return json(200, {
          period: q.get('period'), today: TODAY, range: { from: '2026-11-01', to: '2026-11-30' }, prevDate: '2026-10-01', nextDate: null, includesToday: true,
          total: 130000,
          slips: [slipOf(), slipOf({ id: 30, employeeName: 'Sari', employeeId: 2, amount: 50000, note: null, wageDate: '2026-11-05', canVoid: false })],
        });
      }
      if (path === '/api/wages' && method === 'POST') {
        if (failNextWage) {
          failNextWage = false;
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        if (wageError) return json(wageError.status, { error: wageError.error });
        return json(201, { duplicate: false, slips: body.items.map((it, i) => slipOf({ id: 40 + i, employeeId: it.employeeId, employeeName: employees.find((e) => e.id === it.employeeId).name, amount: it.amount, note: it.note || null })) });
      }
      if (path.startsWith('/api/wages') && method === 'GET') {
        return json(200, {
          date: q.get('date') ?? TODAY, today: TODAY, cashIn: 200000, expenses: 30000, wagesPaid: daySlips.reduce((s, x) => s + x.amount, 0),
          remaining: 170000 - daySlips.reduce((s, x) => s + x.amount, 0),
          employees: employees.filter((e) => e.isActive).map((e) => ({ id: e.id, name: e.name, phone: e.phone, slip: daySlips.find((s) => s.employeeId === e.id) ?? null })),
          slips: daySlips,
        });
      }
      if (path.startsWith('/api/employees') && method === 'GET') return json(200, { employees });
      if (path === '/api/employees' && method === 'POST') {
        if (employeeError) return json(employeeError.status, { error: employeeError.error });
        const e = { id: 9, name: body.name, phone: body.phone || null, isActive: true };
        employees = [...employees, e];
        return json(201, { employee: e });
      }
      if (path.startsWith('/api/employees/') && method === 'PATCH') {
        employees = employees.map((e) => (e.id === Number(path.split('/').pop()) ? { ...e, ...body } : e));
        return json(200, { employee: employees[0] });
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

const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('layar Upah: catat upah hari ini', () => {
  it('acuan uang masuk; tidak ada tarif otomatis; hanya karyawan aktif', async () => {
    renderApp('/upah');
    expect(await screen.findByText('Rp 200.000')).toBeTruthy(); // uang masuk hari ini sebagai acuan
    expect(screen.getByText('Pengeluaran lain')).toBeTruthy();
    expect(screen.getByText(/hanya acuan/)).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Budi' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Sari' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Doni' })).toBeNull(); // nonaktif
    expect(urls).toContain('/api/wages'); // tanpa tanggal: server yang menentukan hari ini
    // dicentang -> kolom upah kosong (tidak terisi tarif)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Budi' }));
    expect(screen.getByLabelText('Upah Budi (Rp)').value).toBe('');
  });

  it('nominal ditentukan pemilik; ringkasan sisa kas ikut berubah; tersimpan dengan tautan slip', async () => {
    renderApp('/upah');
    await screen.findByText('Rp 200.000');
    const submit = screen.getByRole('button', { name: 'Simpan dan bayar' });
    expect(submit.disabled).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Budi' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sari' }));
    fill('Upah Budi (Rp)', '80000');
    fill('Upah Sari (Rp)', '50000');
    fill('Catatan Budi (boleh kosong)', 'ramai hari ini');
    // 200.000 - 30.000 - (80.000 + 50.000) = 40.000
    const row = (label) => screen.getByText(label).closest('div');
    expect(within(row('Upah yang akan dibayar')).getByText('Rp 130.000')).toBeTruthy();
    expect(within(row('Sisa kas setelah upah')).getByText('Rp 40.000')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Simpan dan bayar (2 karyawan)' }));
    expect(await screen.findByText('2 slip upah tersimpan.')).toBeTruthy();
    const post = calls.find(([m, p]) => m === 'POST' && p === '/api/wages');
    expect(post[2].wageDate).toBe(TODAY);
    expect(post[2].items).toEqual([
      { employeeId: 1, amount: 80000, note: 'ramai hari ini' },
      { employeeId: 2, amount: 50000, note: '' },
    ]);
    expect(post[2].clientRequestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(screen.getByRole('link', { name: 'Buka slip Budi' }).getAttribute('href')).toBe('/upah/slip/40');
  });

  it('upah yang dicentang tetapi kosong ditolak di layar', async () => {
    renderApp('/upah');
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Budi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan dan bayar (1 karyawan)' }));
    expect(await screen.findByText('Isi upah.')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('karyawan yang sudah punya slip hari itu tidak bisa dicentang lagi', async () => {
    daySlips = [slipOf({ employeeId: 1, amount: 80000 })];
    renderApp('/upah');
    expect(await screen.findByText('Sudah dibayar Rp 80.000')).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Budi' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Lihat slip' }).getAttribute('href')).toBe('/upah/slip/31');
    expect(screen.getByText('Upah sudah dibayar')).toBeTruthy();
  });

  it('gagal kirim lalu dicoba lagi memakai clientRequestId yang sama; galat server tampil', async () => {
    failNextWage = true;
    renderApp('/upah');
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Budi' }));
    fill('Upah Budi (Rp)', '70000');
    fireEvent.click(screen.getByRole('button', { name: 'Simpan dan bayar (1 karyawan)' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Simpan dan bayar (1 karyawan)' }));
    expect(await screen.findByText('1 slip upah tersimpan.')).toBeTruthy();
    const posts = calls.filter(([m, p]) => m === 'POST' && p === '/api/wages');
    expect(posts).toHaveLength(2);
    expect(posts[1][2].clientRequestId).toBe(posts[0][2].clientRequestId);
  });

  it('pesan galat dari server (slip sudah ada) ditampilkan', async () => {
    wageError = { status: 409, error: { code: 'WAGE_EXISTS', message: 'Slip untuk Budi pada tanggal ini sudah ada.' } };
    renderApp('/upah');
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Budi' }));
    fill('Upah Budi (Rp)', '70000');
    fireEvent.click(screen.getByRole('button', { name: 'Simpan dan bayar (1 karyawan)' }));
    expect(await screen.findByText('Slip untuk Budi pada tanggal ini sudah ada.')).toBeTruthy();
  });
});

describe('kelola karyawan', () => {
  it('daftar menandai nonaktif; tambah karyawan memvalidasi nama dan menampilkan galat nama kembar', async () => {
    renderApp('/upah');
    fireEvent.click(await screen.findByRole('button', { name: 'Kelola karyawan' }));
    const dialog = await screen.findByRole('dialog', { name: 'Kelola karyawan' });
    expect(await within(dialog).findByText('Doni')).toBeTruthy();
    expect(within(dialog).getByText('Nonaktif')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Tambah karyawan' }));
    const form = await screen.findByRole('dialog', { name: 'Karyawan baru' });
    fireEvent.click(within(form).getByRole('button', { name: 'Simpan' }));
    expect(await within(form).findByText('Nama wajib diisi.')).toBeTruthy();
    expect(within(form).queryByLabelText(/tarif|upah per hari/i)).toBeNull(); // tidak ada tarif tetap

    employeeError = { status: 409, error: { code: 'DUPLICATE_NAME', message: 'Nama karyawan sudah ada.' } };
    fireEvent.change(within(form).getByLabelText('Nama'), { target: { value: 'Budi' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Simpan' }));
    expect(await within(form).findByText('Nama karyawan sudah ada.')).toBeTruthy();

    employeeError = null;
    fireEvent.change(within(form).getByLabelText('Nama'), { target: { value: 'Rina' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Simpan' }));
    await waitFor(() => expect(calls.some(([m, p, b]) => m === 'POST' && p === '/api/employees' && b.name === 'Rina')).toBe(true));
    expect((await screen.findAllByText('Rina')).length).toBeGreaterThan(0); // kembali ke daftar, karyawan baru ada
  });

  it('menonaktifkan karyawan lewat formulir ubah', async () => {
    renderApp('/upah');
    fireEvent.click(await screen.findByRole('button', { name: 'Kelola karyawan' }));
    const dialog = await screen.findByRole('dialog', { name: 'Kelola karyawan' });
    fireEvent.click(await within(dialog).findByRole('button', { name: /Sari/ }));
    const form = await screen.findByRole('dialog', { name: 'Ubah karyawan' });
    fireEvent.click(within(form).getByRole('checkbox', { name: /Karyawan aktif/ }));
    fireEvent.click(within(form).getByRole('button', { name: 'Simpan' }));
    await waitFor(() => expect(calls.some(([m, p, b]) => m === 'PATCH' && p === '/api/employees/2' && b.isActive === false)).toBe(true));
  });
});

describe('riwayat slip', () => {
  it('total, buka slip, batalkan dengan konfirmasi, dan saringan karyawan', async () => {
    renderApp('/upah');
    const section = await screen.findByRole('region', { name: 'Riwayat slip' }).catch(() => null);
    const root = section ?? document.body;
    expect(await within(root).findByText('2 slip')).toBeTruthy();
    expect(within(root).getByText('Total upah periode ini')).toBeTruthy();
    expect(urls.some((u) => u.startsWith('/api/wages/slips?period=monthly'))).toBe(true);

    const batal = within(root).getAllByRole('button', { name: 'Batalkan' });
    expect(batal).toHaveLength(1); // slip Sari tanggal lampau tidak boleh dibatalkan pemilik
    expect(batal[0].className).toMatch(/border-danger/);
    fireEvent.click(batal[0]);
    fireEvent.click(within(root).getByRole('button', { name: 'Ya, batalkan' }));
    await waitFor(() => expect(calls.some(([m, p]) => m === 'PATCH' && p === '/api/wages/slips/31')).toBe(true));

    fireEvent.change(within(root).getByLabelText('Karyawan'), { target: { value: '2' } });
    await waitFor(() => expect(urls.some((u) => u.includes('employeeId=2'))).toBe(true));
    expect((await within(root).findAllByRole('link', { name: 'Buka slip' }))[0].getAttribute('href')).toMatch(/^\/upah\/slip\/\d+$/);
  });
});

describe('slip upah harian', () => {
  it('menampilkan isi slip, tombol cetak memanggil print, dan tombol kembali', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    renderApp('/upah/slip/31');
    expect(await screen.findByRole('heading', { name: 'Slip Upah Harian' })).toBeTruthy();
    expect(screen.getByText('No. 31')).toBeTruthy();
    expect(screen.getByText('Budi')).toBeTruthy();
    expect(screen.getByText('Rp 80.000')).toBeTruthy();
    expect(screen.getByText('ramai hari ini')).toBeTruthy();
    expect(screen.getByText(/Minggu, 8 November 2026/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Kembali ke Upah' }).getAttribute('href')).toBe('/upah');

    fireEvent.click(screen.getByRole('button', { name: /Cetak/ }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('bagikan: memakai Web Share bila ada, jika tidak membuka WhatsApp dengan teks slip', async () => {
    const share = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    renderApp('/upah/slip/31');
    fireEvent.click(await screen.findByRole('button', { name: 'Bagikan' }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const text = share.mock.calls[0][0].text;
    expect(text).toContain('SLIP UPAH HARIAN');
    expect(text).toContain('Nama: Budi');
    expect(text).toContain('Upah: Rp 80.000');
    expect(text).toContain('Catatan: ramai hari ini');
    cleanup();

    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    const open = vi.fn();
    vi.stubGlobal('open', open);
    renderApp('/upah/slip/31');
    fireEvent.click(await screen.findByRole('button', { name: 'Bagikan' }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(open.mock.calls[0][0]).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(decodeURIComponent(open.mock.calls[0][0])).toContain('Nama: Budi');
  });
});

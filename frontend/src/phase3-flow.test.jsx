// Menguji layar Utang, Stok toren, dan ringkasan Beranda di React sungguhan (jsdom) dengan backend palsu.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';

const PEMILIK = { id: 2, name: 'Abah', username: 'abah', role: 'PEMILIK' };

let debts; // keadaan utang palsu
let tank; // keadaan toren palsu
let calls; // [method, path, body]
let failNextPayment;

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

const knownTank = (over = {}) => ({
  today: '2026-11-07', capacityLiters: 6000, litersPerGallon: 19, known: true, status: 'OK', level: 'OK',
  remainingLiters: 4810, percent: 80, gallonsLeft: 253, avgDailyGallons: 10, daysLeft: 25.3, emptyOn: '2026-12-02',
  adjustedAt: '2026-11-06T01:00:00Z', litersAfterAdjustment: 5000, refillLitersSince: 0, gallonsSince: 10, ...over,
});

beforeEach(() => {
  calls = [];
  failNextPayment = false;
  debts = {
    customers: [{ customerId: 1, name: 'Warung Bu Ani', phone: '0812', isActive: true, outstanding: 85500, orderCount: 3, oldestAt: '2026-11-01T02:00:00Z' }],
    umumOrders: [{ orderId: 50, orderedAt: '2026-11-05T03:00:00Z', qty: 3, total: 18000, paid: 0, outstanding: 18000, note: 'Pak Dedi RT 3' }],
    totals: { total: 103500, customerTotal: 85500, umumTotal: 18000 },
  };
  tank = knownTank();

  vi.stubGlobal(
    'fetch',
    vi.fn((url, opts = {}) => {
      const path = String(url);
      const method = opts.method || 'GET';
      const body = opts.body ? JSON.parse(opts.body) : null;
      if (method !== 'GET') calls.push([method, path.replace(/^.*\/api/, '/api'), body]);

      if (path.endsWith('/api/auth/me')) return json(200, { user: PEMILIK });
      if (path.endsWith('/api/summary')) {
        return json(200, { today: '2026-11-07', orders: { orderCount: 4, gallons: 30, total: 150000 }, totalDebt: debts.totals.total, tank });
      }
      if (path.endsWith('/api/debts')) return json(200, debts);
      if (path.endsWith('/api/debts/customers/1')) {
        return json(200, {
          customer: { id: 1, name: 'Warung Bu Ani', phone: '0812' },
          outstanding: debts.customers[0]?.outstanding ?? 0,
          orders: [
            { orderId: 11, orderedAt: '2026-11-01T02:00:00Z', qty: 10, total: 45000, paid: 0, outstanding: 45000, note: null },
            { orderId: 12, orderedAt: '2026-11-02T02:00:00Z', qty: 5, total: 22500, paid: 5000, outstanding: 17500, note: null },
          ],
          payments: [
            { batchId: 'b1', source: 'DEBT', amount: 5000, waived: 1000, waiverNote: 'hanya bawa segitu', paidAt: '2026-11-07T01:00:00Z', orderIds: [12], byName: 'Abah', canVoid: true },
          ],
        });
      }
      if (path.endsWith('/api/payments') && method === 'POST') {
        if (failNextPayment) {
          failNextPayment = false;
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        const cur = body.customerId ? debts.customers[0].outstanding : debts.umumOrders[0].outstanding;
        const waived = body.waiveRemaining && body.amount < cur ? cur - body.amount : 0;
        const left = cur - body.amount - waived;
        if (body.customerId) {
          debts.customers[0].outstanding = left;
          if (left === 0) debts.customers = [];
        } else {
          debts.umumOrders[0].outstanding = left;
          if (left === 0) debts.umumOrders = [];
        }
        debts.totals.total -= body.amount + waived;
        return json(201, { payment: { batchId: 'new', amount: body.amount, waived, allocations: [], remainingDebt: left, duplicate: false } });
      }
      if (path.includes('/api/payments/') && method === 'PATCH') return json(200, { ok: true });
      if (path.endsWith('/api/tank')) return json(200, { tank });
      if (path.endsWith('/api/tank/history')) {
        return json(200, { items: [
          { type: 'REFILL', id: 7, at: '2026-11-07T02:00:00Z', liters: 1000, note: 'truk air', byName: 'Abah', canVoid: true },
          { type: 'ADJUSTMENT', id: 3, at: '2026-11-06T01:00:00Z', liters: 5000, note: null, byName: 'Abah', canVoid: false },
          { type: 'PERSONAL', id: 9, at: '2026-11-06T05:00:00Z', gallons: 3, note: null, byName: 'Abah', canVoid: true },
        ] });
      }
      if (path.endsWith('/api/tank/refills') && method === 'POST') return json(201, { id: 8, duplicate: false });
      if (path.endsWith('/api/tank/adjustments') && method === 'POST') {
        tank = knownTank({ remainingLiters: body.litersAfter, percent: Math.round((body.litersAfter / 6000) * 100) });
        return json(201, { id: 4, duplicate: false });
      }
      if (path.endsWith('/api/personal-use') && method === 'POST') return json(201, { id: 10, duplicate: false });
      if (path.includes('/api/tank/refills/') && method === 'PATCH') return json(200, { ok: true });
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

describe('ringkasan Beranda', () => {
  it('menampilkan order hari ini, total utang, dan sisa toren', async () => {
    renderApp('/');
    expect(await screen.findByText('4 order')).toBeTruthy();
    expect(screen.getByText('30 galon · Rp 150.000')).toBeTruthy();
    expect(screen.getByText('Rp 103.500')).toBeTruthy();
    expect(screen.getByText('4.810 liter')).toBeTruthy();
  });

  it('toren belum diatur: tampil ajakan atur stok awal', async () => {
    tank = { today: '2026-11-07', capacityLiters: 6000, litersPerGallon: 19, known: false, status: 'NEEDS_ADJUSTMENT', level: 'UNKNOWN' };
    renderApp('/');
    expect(await screen.findByText('Belum diatur')).toBeTruthy();
  });
});

describe('layar Utang', () => {
  it('menampilkan total, pelanggan, dan utang Umum per order dengan catatannya', async () => {
    renderApp('/utang');
    expect(await screen.findByText('Rp 103.500')).toBeTruthy();
    expect(screen.getByText('Warung Bu Ani')).toBeTruthy();
    expect(screen.getByText('Pak Dedi RT 3')).toBeTruthy();
    expect(screen.getByText('Pelanggan umum')).toBeTruthy();
  });

  it('mencatat cicilan untuk pelanggan; jumlah melebihi utang ditolak di layar', async () => {
    renderApp('/utang');
    fireEvent.click(await screen.findByRole('button', { name: /Warung Bu Ani/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Warung Bu Ani' });
    expect(await within(dialog).findByText('Order belum lunas')).toBeTruthy();
    expect(within(dialog).getByText('Pembayaran masuk ke order tertua dulu.')).toBeTruthy();

    const input = within(dialog).getByLabelText('Jumlah dibayar (Rp)');
    fireEvent.change(input, { target: { value: '99999999' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Catat pembayaran' }));
    expect(await within(dialog).findByText(/melebihi sisa utang/)).toBeTruthy();
    expect(calls.filter(([, p]) => p === '/api/payments')).toHaveLength(0);

    fireEvent.change(input, { target: { value: '50000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Catat pembayaran' }));
    expect(await within(dialog).findByText(/Pembayaran Rp 50\.000 tersimpan/)).toBeTruthy();
    const post = calls.find(([, p]) => p === '/api/payments');
    expect(post[2]).toMatchObject({ customerId: 1, amount: 50000 });
    expect(post[2].clientRequestId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('"Lunasi semua" mengisi seluruh sisa utang', async () => {
    renderApp('/utang');
    fireEvent.click(await screen.findByRole('button', { name: /Warung Bu Ani/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Lunasi semua' }));
    expect(within(dialog).getByLabelText('Jumlah dibayar (Rp)').value).toBe('85500');
  });

  it('gagal kirim lalu dicoba lagi memakai clientRequestId yang sama', async () => {
    failNextPayment = true;
    renderApp('/utang');
    fireEvent.click(await screen.findByRole('button', { name: /Warung Bu Ani/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(await within(dialog).findByLabelText('Jumlah dibayar (Rp)'), { target: { value: '10000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Catat pembayaran' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Catat pembayaran' }));
    expect(await within(dialog).findByText(/tersimpan/)).toBeTruthy();
    const posts = calls.filter(([, p]) => p === '/api/payments');
    expect(posts).toHaveLength(2);
    expect(posts[1][2].clientRequestId).toBe(posts[0][2].clientRequestId);
  });

  it('utang Umum dibayar per order (orderId), bukan customerId', async () => {
    renderApp('/utang');
    fireEvent.click(await screen.findByRole('button', { name: 'Bayar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Bayar utang umum' });
    fireEvent.change(within(dialog).getByLabelText('Jumlah dibayar (Rp)'), { target: { value: '18000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Catat pembayaran' }));
    expect(await within(dialog).findByText(/Utang lunas/)).toBeTruthy();
    const post = calls.find(([, p]) => p === '/api/payments');
    expect(post[2]).toMatchObject({ orderId: 50, amount: 18000 });
    expect(post[2].customerId).toBeUndefined();
  });

  it('membatalkan pembayaran dengan konfirmasi', async () => {
    renderApp('/utang');
    fireEvent.click(await screen.findByRole('button', { name: /Warung Bu Ani/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Batalkan' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ya, batalkan' }));
    await waitFor(() => expect(calls.some(([m, p]) => m === 'PATCH' && p === '/api/payments/b1')).toBe(true));
  });

  it('tanpa utang: tampil pesan semua lunas', async () => {
    debts = { customers: [], umumOrders: [], totals: { total: 0, customerTotal: 0, umumTotal: 0 } };
    renderApp('/utang');
    expect(await screen.findByText('Tidak ada utang. Semua order sudah lunas.')).toBeTruthy();
  });
});

describe('layar Stok toren', () => {
  it('menampilkan sisa, persen, setara galon, dan perkiraan habis', async () => {
    renderApp('/stok');
    expect(await screen.findByText('4.810 liter')).toBeTruthy();
    expect(screen.getByText(/80% dari 6\.000 liter · setara 253 galon/)).toBeTruthy();
    expect(screen.getByText(/Perkiraan habis 25,3 hari lagi/)).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Isi toren' }).getAttribute('aria-valuenow')).toBe('80');
    expect(await screen.findByText('Air masuk +1.000 liter')).toBeTruthy(); // riwayat dimuat terpisah
    expect(screen.getByText('Koreksi stok: sisa 5.000 liter')).toBeTruthy();
    expect(screen.getByText('Konsumsi pribadi 3 galon')).toBeTruthy();
  });

  it('peringatan sesuai tingkat: menipis dan hampir habis', async () => {
    tank = knownTank({ level: 'LOW', daysLeft: 2.4 });
    renderApp('/stok');
    expect(await screen.findByText('Air toren menipis.')).toBeTruthy();
    cleanup();
    tank = knownTank({ level: 'CRITICAL', daysLeft: 0.5 });
    renderApp('/stok');
    expect(await screen.findByText('Air hampir habis. Segera isi toren.')).toBeTruthy();
    expect(screen.getByText(/Perkiraan habis kurang dari 1 hari/)).toBeTruthy();
  });

  it('stok awal belum diatur: ajakan, tombol air masuk dan pakai pribadi nonaktif; koreksi awal tersimpan', async () => {
    tank = { today: '2026-11-07', capacityLiters: 6000, litersPerGallon: 19, known: false, status: 'NEEDS_ADJUSTMENT', level: 'UNKNOWN' };
    renderApp('/stok');
    expect(await screen.findByText('Stok awal belum diatur')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Air masuk' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Pakai pribadi' }).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Atur stok awal' }));
    const dialog = await screen.findByRole('dialog', { name: 'Atur stok awal' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan koreksi' }));
    expect(await within(dialog).findByText('Isi sisa air di toren sekarang.')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: /Toren penuh/ }));
    expect(within(dialog).getByLabelText('Sisa air sekarang (liter)').value).toBe('6000');
    fireEvent.change(within(dialog).getByLabelText('Sisa air sekarang (liter)'), { target: { value: '4200' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan koreksi' }));
    expect(await screen.findByText('Koreksi stok tersimpan.')).toBeTruthy();
    expect(calls.find(([, p]) => p === '/api/tank/adjustments')[2]).toMatchObject({ litersAfter: 4200 });
    expect(await screen.findByText('4.200 liter')).toBeTruthy();
  });

  it('air masuk: validasi liter dan kirim tanggal dari server', async () => {
    renderApp('/stok');
    fireEvent.click(await screen.findByRole('button', { name: 'Air masuk' }));
    const dialog = await screen.findByRole('dialog', { name: 'Air masuk' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan air masuk' }));
    expect(await within(dialog).findByText('Isi jumlah liter yang masuk.')).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText('Jumlah air masuk (liter)'), { target: { value: '9999' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan air masuk' }));
    expect(await within(dialog).findByText(/kapasitas toren/)).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText('Jumlah air masuk (liter)'), { target: { value: '2000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan air masuk' }));
    expect(await screen.findByText('Air masuk tersimpan.')).toBeTruthy();
    expect(calls.find(([, p]) => p === '/api/tank/refills')[2]).toMatchObject({ liters: 2000, refillDate: '2026-11-07' });
  });

  it('konsumsi pribadi: kirim jumlah galon dan membatalkan catatan air masuk', async () => {
    renderApp('/stok');
    fireEvent.click(await screen.findByRole('button', { name: 'Pakai pribadi' }));
    const dialog = await screen.findByRole('dialog', { name: 'Konsumsi pribadi' });
    fireEvent.change(within(dialog).getByLabelText('Jumlah galon'), { target: { value: '5' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByText('Konsumsi pribadi tersimpan.')).toBeTruthy();
    expect(calls.find(([, p]) => p === '/api/personal-use')[2]).toMatchObject({ gallons: 5, useDate: '2026-11-07' });

    fireEvent.click((await screen.findAllByRole('button', { name: 'Batalkan' }))[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Ya, batalkan' }));
    await waitFor(() => expect(calls.some(([m, p]) => m === 'PATCH' && p === '/api/tank/refills/7')).toBe(true));
  });

  it('koreksi stok tidak punya tombol batalkan', async () => {
    renderApp('/stok');
    await screen.findByText('Koreksi stok: sisa 5.000 liter');
    // dua catatan lain (air masuk, pribadi) punya tombol; koreksi tidak
    expect(screen.getAllByRole('button', { name: 'Batalkan' })).toHaveLength(2);
  });
});

describe('keringanan: kurang bayar dianggap lunas', () => {
  const openUmum = async () => {
    renderApp('/utang');
    fireEvent.click(await screen.findByRole('button', { name: 'Bayar' }));
    return screen.findByRole('dialog', { name: 'Bayar utang umum' });
  };
  const amountInput = (dialog) => within(dialog).getByLabelText('Jumlah dibayar (Rp)');

  it('pilihan "anggap lunas" hanya muncul bila jumlah kurang dari sisa utang', async () => {
    const dialog = await openUmum(); // utang Rp 18.000
    const option = () => within(dialog).queryByRole('checkbox', { name: /Anggap lunas/ });
    expect(option()).toBeNull(); // belum diisi
    fireEvent.change(amountInput(dialog), { target: { value: '5000' } });
    expect(option()).toBeTruthy();
    expect(within(dialog).getByText(/sisa Rp 13\.000 dimaafkan/)).toBeTruthy();
    fireEvent.change(amountInput(dialog), { target: { value: '18000' } });
    expect(option()).toBeNull(); // pas = lunas biasa
    fireEvent.change(amountInput(dialog), { target: { value: '99999' } });
    expect(option()).toBeNull(); // melebihi utang
  });

  it('catatan alasan wajib; setelah diisi tersimpan dan utang lunas', async () => {
    const dialog = await openUmum();
    fireEvent.change(amountInput(dialog), { target: { value: '5000' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Anggap lunas/ }));
    expect(within(dialog).getByRole('button', { name: 'Catat dan anggap lunas' })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Catat dan anggap lunas' }));
    expect(await within(dialog).findByText('Isi catatan alasan keringanan.')).toBeTruthy();
    expect(calls.filter(([, p]) => p === '/api/payments')).toHaveLength(0);

    fireEvent.change(within(dialog).getByLabelText('Catatan alasan (wajib)'), { target: { value: 'Pelanggan hanya bawa Rp 5.000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Catat dan anggap lunas' }));
    expect(await within(dialog).findByText(/Sisa Rp 13\.000 dianggap lunas\. Utang lunas\./)).toBeTruthy();
    const post = calls.find(([, p]) => p === '/api/payments');
    expect(post[2]).toMatchObject({ orderId: 50, amount: 5000, waiveRemaining: true, note: 'Pelanggan hanya bawa Rp 5.000' });
  });

  it('tanpa mencentang, kurang bayar biasa: tidak mengirim keringanan dan sisa utang tetap', async () => {
    const dialog = await openUmum();
    fireEvent.change(amountInput(dialog), { target: { value: '5000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Catat pembayaran' }));
    expect(await within(dialog).findByText(/Sisa utang Rp 13\.000/)).toBeTruthy();
    const post = calls.find(([, p]) => p === '/api/payments');
    expect(post[2].waiveRemaining).toBeUndefined();
    expect(post[2].note).toBeUndefined();
  });

  it('pelanggan bernama: sisa seluruh utang dimaafkan; pesan hasil tetap terlihat setelah lunas', async () => {
    renderApp('/utang');
    fireEvent.click(await screen.findByRole('button', { name: /Warung Bu Ani/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Warung Bu Ani' });
    fireEvent.change(await within(dialog).findByLabelText('Jumlah dibayar (Rp)'), { target: { value: '50000' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Anggap lunas/ }));
    fireEvent.change(within(dialog).getByLabelText('Catatan alasan (wajib)'), { target: { value: 'sepakat 50 ribu' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Catat dan anggap lunas' }));
    expect(await within(dialog).findByText(/Sisa Rp 35\.500 dianggap lunas/)).toBeTruthy();
  });

  it('riwayat pembayaran menampilkan keringanan dan catatannya', async () => {
    renderApp('/utang');
    fireEvent.click(await screen.findByRole('button', { name: /Warung Bu Ani/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/\+ keringanan Rp 1\.000 \(dianggap lunas\)/)).toBeTruthy();
    expect(within(dialog).getByText('“hanya bawa segitu”')).toBeTruthy();
  });
});

describe('tombol aksi berbentuk tombol sungguhan', () => {
  it('"Bayar" adalah tombol utama; "Batalkan" adalah tombol bergaris merah', async () => {
    renderApp('/utang');
    const bayar = await screen.findByRole('button', { name: 'Bayar' });
    expect(bayar.className).toMatch(/bg-brand/);
    expect(bayar.className).toMatch(/min-h-11/); // cukup besar untuk jempol
    fireEvent.click(await screen.findByRole('button', { name: /Warung Bu Ani/ }));
    const dialog = await screen.findByRole('dialog');
    const batalkan = await within(dialog).findByRole('button', { name: 'Batalkan' });
    expect(batalkan.className).toMatch(/border-danger/);
    expect(batalkan.className).toMatch(/min-h-11/);
  });

  it('"Batalkan" di riwayat stok juga tombol bergaris merah', async () => {
    renderApp('/stok');
    const tombol = await screen.findAllByRole('button', { name: 'Batalkan' });
    expect(tombol[0].className).toMatch(/border-danger/);
  });
});

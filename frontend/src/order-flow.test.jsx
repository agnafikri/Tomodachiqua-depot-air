// Menguji layar Order dan Pelanggan di React sungguhan (jsdom) dengan backend palsu.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';

const PEMILIK = { id: 2, name: 'Abah', username: 'abah', role: 'PEMILIK' };

let customers;
let posts; // semua POST /api/orders yang diterima
let failNextOrder;
let nextCustomerError;

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

function fakePrice({ customerId, qty, isDelivered }) {
  const c = customers.find((x) => x.id === customerId);
  const unitPrice = c?.customPrice ?? (isDelivered ? 6000 : 5000);
  const freeQty = c?.bundleBuy ? Math.floor(qty / c.bundleBuy) * (c.bundleBuy - c.bundlePay) : 0;
  const paidQty = qty - freeQty;
  return {
    qty, unitPrice, paidQty, freeQty, total: paidQty * unitPrice,
    priceRule: c?.customPrice ? 'CUSTOM' : 'STANDARD',
    bundle: freeQty ? { buy: c.bundleBuy, pay: c.bundlePay } : null,
  };
}

beforeEach(() => {
  customers = [
    { id: 1, name: 'Warung Bu Ani', phone: '0812', address: 'Pasar', customPrice: 4500, bundleBuy: 10, bundlePay: 9, isActive: true },
    { id: 2, name: 'Pak Budi', phone: null, address: null, customPrice: null, bundleBuy: null, bundlePay: null, isActive: true },
  ];
  posts = [];
  failNextOrder = false;
  nextCustomerError = null;

  vi.stubGlobal(
    'fetch',
    vi.fn((url, opts = {}) => {
      const path = String(url);
      const method = opts.method || 'GET';
      const body = opts.body ? JSON.parse(opts.body) : null;

      if (path.endsWith('/api/auth/me')) return json(200, { user: PEMILIK });
      if (path.includes('/api/customers') && method === 'GET') return json(200, { customers });
      if (path.endsWith('/api/customers') && method === 'POST') {
        if (nextCustomerError) return json(nextCustomerError.status, { error: nextCustomerError.error });
        const c = { id: 99, phone: null, address: null, customPrice: null, bundleBuy: null, bundlePay: null, isActive: true, ...body, phone: body.phone || null, address: body.address || null };
        customers = [...customers, c];
        return json(201, { customer: c });
      }
      if (path.endsWith('/api/orders/preview')) return json(200, { price: fakePrice(body) });
      if (path.endsWith('/api/orders') && method === 'POST') {
        posts.push(body);
        if (failNextOrder) {
          failNextOrder = false;
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        const price = fakePrice(body);
        const c = customers.find((x) => x.id === body.customerId);
        return json(201, {
          duplicate: false,
          order: { id: 1, customerName: c?.name ?? null, qty: body.qty, total: price.total, paymentStatus: body.payStatus },
        });
      }
      if (path.includes('/api/orders?')) return json(200, { orders: [], summary: { orderCount: 0, gallons: 0, total: 0, unpaid: 0 } });
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

const radio = (name) => screen.getByRole('radio', { name });
const qtyInput = () => screen.getByRole('textbox', { name: 'Jumlah galon' });

async function pickCustomer(name) {
  fireEvent.click(await screen.findByRole('button', { name: /^Pelanggan/ }));
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(name) }));
}

describe('layar Order', () => {
  it('awalnya Umum, diambil, lunas; utang tidak bisa dipilih untuk Umum', async () => {
    renderApp('/order');
    await screen.findByRole('textbox', { name: 'Jumlah galon' });
    expect(radio('Diambil').getAttribute('aria-checked')).toBe('true');
    expect(radio('Lunas').getAttribute('aria-checked')).toBe('true');
    expect(radio('Utang').disabled).toBe(true);
    expect(await screen.findByText('Rp 5.000')).toBeTruthy();

    await pickCustomer('Pak Budi');
    await waitFor(() => expect(radio('Utang').disabled).toBe(false));
  });

  it('pelanggan harga khusus: default diantar, total memakai harga custom dan diskon paket, lalu tersimpan', async () => {
    renderApp('/order');
    await pickCustomer('Warung Bu Ani');
    await waitFor(() => expect(radio('Diantar').getAttribute('aria-checked')).toBe('true'));

    fireEvent.change(qtyInput(), { target: { value: '20' } });
    // 20 galon, paket beli 10 bayar 9 -> bayar 18 x Rp 4.500 = Rp 81.000
    expect(await screen.findByText('Rp 81.000')).toBeTruthy();
    expect(screen.getByText(/gratis 2 galon/)).toBeTruthy();

    fireEvent.click(radio('Utang'));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan order' }));

    expect(await screen.findByText(/Order tersimpan/)).toBeTruthy();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ customerId: 1, qty: 20, isDelivered: true, payStatus: 'DEBT' });
    expect(posts[0].clientRequestId).toMatch(/^[0-9a-f-]{36}$/i);
    // formulir kembali ke awal
    await waitFor(() => expect(qtyInput().value).toBe('1'));
  });

  it('gagal kirim lalu dicoba lagi memakai clientRequestId yang sama (tidak jadi order ganda)', async () => {
    failNextOrder = true;
    renderApp('/order');
    await screen.findByText('Rp 5.000');
    fireEvent.click(screen.getByRole('button', { name: 'Simpan order' }));
    expect(await screen.findByRole('alert')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Simpan order' }));
    expect(await screen.findByText(/Order tersimpan/)).toBeTruthy();
    expect(posts).toHaveLength(2);
    expect(posts[1].clientRequestId).toBe(posts[0].clientRequestId);
  });

  it('jumlah kosong atau 0 menonaktifkan tombol simpan', async () => {
    renderApp('/order');
    await screen.findByText('Rp 5.000');
    fireEvent.change(qtyInput(), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Simpan order' }).disabled).toBe(true);
    fireEvent.change(qtyInput(), { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Simpan order' }).disabled).toBe(true);
  });

  it('menyaring pelanggan di lembar pencarian', async () => {
    renderApp('/order');
    fireEvent.click(await screen.findByRole('button', { name: /^Pelanggan/ }));
    const search = await screen.findByRole('searchbox', { name: 'Cari pelanggan' });
    search.focus();
    fireEvent.change(search, { target: { value: 'budi' } });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText('Warung Bu Ani')).toBeNull();
    expect(within(dialog).getByText('Pak Budi')).toBeTruthy();
    expect(document.activeElement).toBe(search); // fokus tidak direbut saat mengetik
  });
});

describe('layar Pelanggan', () => {
  it('validasi di layar, lalu menambah pelanggan dengan harga khusus dan paket', async () => {
    renderApp('/pelanggan');
    expect(await screen.findByText('Warung Bu Ani')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    const dialog = await screen.findByRole('dialog', { name: 'Pelanggan baru' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan' }));
    expect(await within(dialog).findByText('Nama wajib diisi.')).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText('Nama'), { target: { value: 'Warung Baru' } });
    fireEvent.change(within(dialog).getByLabelText(/Harga khusus/), { target: { value: '4500' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Diskon paket/ }));
    fireEvent.change(within(dialog).getByLabelText('Bayar (galon)'), { target: { value: '10' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan' }));
    expect(await within(dialog).findByText('Jumlah bayar harus lebih kecil dari jumlah beli.')).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText('Bayar (galon)'), { target: { value: '9' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Warung Baru')).toBeTruthy();
    const post = fetch.mock.calls.find(([u, o]) => String(u).endsWith('/api/customers') && o?.method === 'POST');
    expect(JSON.parse(post[1].body)).toMatchObject({ name: 'Warung Baru', customPrice: 4500, bundleBuy: 10, bundlePay: 9 });
  });

  it('nama kembar dari server tampil di kolom nama', async () => {
    nextCustomerError = { status: 409, error: { code: 'DUPLICATE_NAME', message: 'Nama pelanggan sudah ada.' } };
    renderApp('/pelanggan');
    await screen.findByText('Warung Bu Ani');
    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Nama'), { target: { value: 'Warung Bu Ani' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan' }));
    expect(await within(dialog).findByText('Nama pelanggan sudah ada.')).toBeTruthy();
  });
});

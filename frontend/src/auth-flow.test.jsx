// Menguji alur login/logout di React sungguhan (jsdom) dengan fetch palsu.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';

const USERS = {
  admin: { id: 1, name: 'Agna', username: 'admin', role: 'ADMIN' },
  abah: { id: 2, name: 'Abah', username: 'abah', role: 'PEMILIK' },
};

let session; // pengguna yang sedang login di server palsu

function json(status, body) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  session = null;
  vi.stubGlobal(
    'fetch',
    vi.fn((url, opts = {}) => {
      const path = String(url);
      const method = opts.method || 'GET';
      if (path.endsWith('/api/auth/me')) {
        return session ? json(200, { user: session }) : json(401, { error: { code: 'UNAUTHENTICATED', message: 'Silakan login.' } });
      }
      if (path.endsWith('/api/auth/login') && method === 'POST') {
        const { username, password } = JSON.parse(opts.body);
        if (USERS[username] && password === 'benar123') {
          session = USERS[username];
          return json(200, { user: session });
        }
        return json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Username atau password salah.' } });
      }
      if (path.endsWith('/api/auth/logout') && method === 'POST') {
        session = null;
        return json(200, { ok: true });
      }
      if (path.endsWith('/api/health/db')) return json(200, { ok: true, db: 'terhubung' });
      return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderApp(path = '/') {
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

describe('alur login dan logout', () => {
  it('tanpa sesi, membuka halaman dalam diarahkan ke login', async () => {
    renderApp('/order');
    expect(await screen.findByRole('heading', { name: 'Masuk' })).toBeTruthy();
  });

  it('login berhasil membuka Beranda, lalu logout kembali ke halaman login', async () => {
    renderApp('/login');
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'abah' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'benar123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }));

    expect(await screen.findByText('Halo, Abah')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Keluar' })[0]);

    expect(await screen.findByRole('heading', { name: 'Masuk' })).toBeTruthy();
    expect(screen.queryByText('Halo, Abah')).toBeNull();
  });

  it('setelah logout, login sebagai akun lain menampilkan akun itu (tidak ada data sisa)', async () => {
    session = USERS.admin;
    renderApp('/');
    expect(await screen.findByText('Halo, Agna')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Keluar' })[0]);
    await screen.findByRole('heading', { name: 'Masuk' });

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'abah' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'benar123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }));

    expect(await screen.findByText('Halo, Abah')).toBeTruthy();
    expect(screen.queryByText('Impor dan ekspor')).toBeNull(); // menu admin tidak bocor
  });

  it('sesi berakhir di tengah pemakaian (401) mengembalikan ke login', async () => {
    session = USERS.abah;
    renderApp('/');
    expect(await screen.findByText('Halo, Abah')).toBeTruthy();
    // server menghapus sesi; permintaan berikutnya (logout) tetap membawa pengguna ke login
    session = null;
    fireEvent.click(screen.getAllByRole('button', { name: 'Keluar' })[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Masuk' })).toBeTruthy());
  });
});

// Peralatan bersama untuk tes API yang memakai database.
// Setiap berkas tes memakai awalan akun sendiri (mis. "dbt") agar tidak saling menghapus.
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { env } from '../src/config/env.mjs';
import { createApp } from '../src/app.mjs';
import { pool } from '../src/db/pool.mjs';
import { setClock } from '../src/services/clock.mjs';

export const PASS = 'sandi-uji-123';

export async function cleanup(prefix) {
  const users = `(SELECT id FROM users WHERE username LIKE '${prefix}\\_%')`;
  await pool.query(`DELETE FROM payments WHERE created_by IN ${users}`);
  await pool.query(`DELETE FROM personal_use WHERE created_by IN ${users}`);
  await pool.query(`DELETE FROM tank_refills WHERE created_by IN ${users}`);
  await pool.query(`DELETE FROM tank_adjustments WHERE created_by IN ${users}`);
  await pool.query(`DELETE FROM orders WHERE created_by IN ${users}`);
  await pool.query("DELETE FROM customers WHERE name LIKE 'ZZTEST%'");
  await pool.query(`DELETE FROM users WHERE username LIKE '${prefix}\\_%'`);
}

export async function createHarness(prefix) {
  if (env.isProduction) throw new Error('Tes tidak boleh dijalankan di produksi.');
  await cleanup(prefix);
  const hash = await bcrypt.hash(PASS, 10);
  await pool.query(
    `INSERT INTO users (name, username, password_hash, role) VALUES
     ('Admin Uji', $2, $1, 'ADMIN'), ('Pemilik Uji', $3, $1, 'PEMILIK')`,
    [hash, `${prefix}_admin`, `${prefix}_pemilik`],
  );
  const server = createApp({ loginMax: 1000 }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  async function api(path, { method = 'GET', body, cookie } = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tomodachiqua', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  }
  async function login(username) {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tomodachiqua' },
      body: JSON.stringify({ username, password: PASS }),
    });
    return res.headers.get('set-cookie').split(';')[0];
  }
  const admin = await login(`${prefix}_admin`);
  const pemilik = await login(`${prefix}_pemilik`);

  async function newCustomer(suffix, extra = {}, cookie = pemilik) {
    const r = await api('/api/customers', { method: 'POST', cookie, body: { name: `ZZTEST ${prefix} ${suffix}`, ...extra } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return r.json.customer;
  }

  return {
    api, admin, pemilik, newCustomer,
    async close() {
      setClock();
      await cleanup(prefix);
      await new Promise((r) => server.close(r));
      await pool.end();
    },
  };
}

// Menetapkan jam server palsu, mis. at('2031-02-01T09:00').
export function at(isoLocal) {
  const d = new Date(`${isoLocal}:00+07:00`);
  setClock(() => d);
  return d;
}

// Pembungkus fetch ke backend: cookie sesi, header pengaman, dan deteksi server yang sedang bangun.
import { useSyncExternalStore } from 'react';

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const TIMEOUT_MS = 90_000; // server gratis butuh sekitar satu menit untuk bangun
const SLOW_AFTER_MS = 3_000;

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// --- status "server sedang disiapkan" ---
let pending = 0;
let slow = false;
let slowTimer = null;
const listeners = new Set();

function setSlow(value) {
  if (slow === value) return;
  slow = value;
  listeners.forEach((l) => l());
}

export function useServerWaking() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => slow,
  );
}

// --- 401 global: AuthProvider mendaftarkan fungsi ini ---
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(method, path, body) {
  pending += 1;
  if (!slowTimer) slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let res;
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        credentials: 'include',
        signal: controller.signal,
        headers: {
          'X-Requested-With': 'tomodachiqua',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, 'NETWORK', 'Tidak bisa terhubung ke server. Periksa koneksi internet lalu coba lagi.');
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = data?.error;
      if (res.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/me') onUnauthorized?.();
      throw new ApiError(res.status, err?.code || 'ERROR', err?.message || 'Terjadi kesalahan.', err?.details);
    }
    return data;
  } finally {
    clearTimeout(timeout);
    pending -= 1;
    if (pending === 0) {
      clearTimeout(slowTimer);
      slowTimer = null;
      setSlow(false);
    }
  }
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  patch: (path, body = {}) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
};

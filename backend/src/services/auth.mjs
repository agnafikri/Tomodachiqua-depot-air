import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.mjs';
import { query } from '../db/pool.mjs';
import { AppError } from '../errors.mjs';

export const SESSION_COOKIE = 'tq_session';

// Hash tiruan agar waktu respons sama baik username ada maupun tidak.
const DUMMY_HASH = bcrypt.hashSync('tidak-dipakai', 12);

export function publicUser(row) {
  return { id: Number(row.id), name: row.name, username: row.username, role: row.role };
}

export async function verifyCredentials(username, password) {
  const { rows } = await query(
    'SELECT id, name, username, password_hash, role, is_active FROM users WHERE lower(username) = lower($1)',
    [username],
  );
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !user.is_active || !ok) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Username atau password salah.');
  }
  return user;
}

export function signSession(user) {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: String(user.id),
    expiresIn: `${env.SESSION_DAYS}d`,
  });
}

export function readSession(token) {
  try {
    return jwt.verify(token, env.JWT_SECRET);
  } catch {
    return null;
  }
}

export async function findActiveUser(id) {
  const { rows } = await query(
    'SELECT id, name, username, role FROM users WHERE id = $1 AND is_active = TRUE',
    [id],
  );
  return rows[0] ?? null;
}

export function cookieOptions() {
  return {
    httpOnly: true,
    // Produksi: frontend (Cloudflare Pages) dan backend (Render) beda domain.
    secure: env.isProduction,
    sameSite: env.isProduction ? 'none' : 'lax',
    path: '/',
  };
}

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    ...cookieOptions(),
    maxAge: env.SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

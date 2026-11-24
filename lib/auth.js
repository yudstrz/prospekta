/**
 * Prospekta Session Auth & RBAC (Web Crypto, aman untuk Edge/Node).
 * RBAC 2 Peran:
 * - 'admin' : Kendali penuh atas user, knowledge base AI Agent, MCP Admin, dan data global.
 * - 'user'  : Akses operasional untuk Lokasi, PDF, Website, dan MCP User scoped per-akun.
 */

export const AUTH_COOKIE_NAME = 'prospekta_auth_session';
const AUTH_SALT = 'prospekta_internal_salt_2026';
const SESSION_TTL_SEC = 60 * 60 * 24 * 7;

const enc = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function adminPassword() {
  return (process.env.ADMIN_PASSWORD || '').trim();
}

export function sessionSecret() {
  return process.env.SESSION_SECRET || adminPassword();
}

export async function generateSessionToken(password) {
  const secret = password || adminPassword();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(secret + AUTH_SALT));
  return hex(buf);
}

export async function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !adminPassword()) return false;
  return timingSafeEqual(token, await generateSessionToken(adminPassword()));
}

async function hmac(data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(sessionSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export async function signSession({ uid, tid, role, email, name }, ttlSec = SESSION_TTL_SEC) {
  if (!sessionSecret()) throw new Error('SESSION_SECRET atau ADMIN_PASSWORD belum di-set.');
  const normalizedRole = role === 'admin' ? 'admin' : 'user';
  const payload = {
    uid: uid || 'usr_admin',
    tid: tid || 'tnt_master',
    role: normalizedRole,
    email: email || '',
    name: name || '',
    exp: Math.floor(Date.now() / 1000) + ttlSec
  };
  const body = b64u(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(body)}`;
}

/**
 * Membaca session cookie. Mengembalikan { role: 'admin' | 'user', uid, tid, email, name } atau null.
 */
export async function readSession(token) {
  if (!token || typeof token !== 'string') return null;
  // Token legacy ADMIN_PASSWORD hash -> otomatis diperlakukan sebagai role 'admin'
  if (!token.includes('.')) {
    const valid = await verifySessionToken(token);
    return valid ? { role: 'admin', uid: 'usr_admin_master', name: 'Prospekta Admin', isSuperadmin: true } : null;
  }
  const [body, sig] = token.split('.');
  if (!sessionSecret() || !timingSafeEqual(sig || '', await hmac(body))) return null;
  try {
    const p = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    if (p.exp <= Date.now() / 1000) return null;
    p.role = (p.role === 'admin' || p.role === 'superadmin') ? 'admin' : 'user';
    p.isSuperadmin = p.role === 'admin';
    return p;
  } catch {
    return null;
  }
}

export function sessionFromRequest(request) {
  const cookieVal = request.cookies.get(AUTH_COOKIE_NAME)?.value || null;
  return readSession(cookieVal);
}

export const isAdmin = (s) => s?.role === 'admin';
export const isUser = (s) => s?.role === 'user' || s?.role === 'admin';
export const isSuperadmin = (s) => s?.role === 'admin';

export async function requireRole(request, requiredRole = 'user') {
  const session = await sessionFromRequest(request);
  if (!session) {
    const err = new Error('Sesi autentikasi diperlukan. Silakan login terlebih dahulu.');
    err.status = 401;
    throw err;
  }
  if (requiredRole === 'admin' && !isAdmin(session)) {
    const err = new Error('Akses ditolak. Tindakan ini memerlukan hak akses Admin.');
    err.status = 403;
    throw err;
  }
  return session;
}

export function applySessionCookie(response, token, remember = true) {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: remember ? SESSION_TTL_SEC : 60 * 60 * 24,
  });
  return response;
}

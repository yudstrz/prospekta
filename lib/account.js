import { randomInt, createHmac, timingSafeEqual } from 'node:crypto';
import { dbWrite } from './db';
import { sendEmail } from './email';
import { sessionSecret } from './auth';
import { ensureTenantSchema, hashPassword, provisionTenant } from './tenant';

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;
const MIN_PASSWORD = 8;

const fail = (message, status) => Object.assign(new Error(message), { status });
const normEmail = (e) => String(e || '').trim().toLowerCase();
const validEmail = (e) => /^\S+@\S+\.\S+$/.test(e);

const hits = new Map();
/** Pembatas per-instance (cukup menahan brute force kasar; reset saat cold start). */
export function rateLimit(key, max = 10, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.delete(hits.keys().next().value);
  if (recent.length > max) throw fail('Terlalu banyak percobaan. Coba lagi beberapa menit lagi.', 429);
}

function hashCode(email, purpose, code) {
  const secret = sessionSecret();
  if (!secret) throw new Error('SESSION_SECRET belum di-set.');
  return createHmac('sha256', secret).update(`${email}:${purpose}:${code}`).digest('hex');
}

const COPY = {
  verify: { subject: 'Kode verifikasi akun Prospekta', lead: 'Gunakan kode ini untuk memverifikasi email Anda' },
  reset: { subject: 'Kode reset password Prospekta', lead: 'Gunakan kode ini untuk mengatur ulang password Anda' },
};

async function issueCode(email, purpose) {
  const now = Date.now();
  const { rows } = await dbWrite.execute({
    sql: 'SELECT created_at FROM auth_codes WHERE email = ? AND purpose = ? AND created_at > ? ORDER BY created_at DESC',
    args: [email, purpose, now - 60 * 60 * 1000],
  });
  if (rows.length >= MAX_CODES_PER_HOUR) throw fail('Batas pengiriman kode per jam tercapai. Coba lagi nanti.', 429);
  if (rows[0] && now - Number(rows[0].created_at) < RESEND_COOLDOWN_MS) throw fail('Tunggu sekitar 1 menit sebelum meminta kode baru.', 429);

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const { subject, lead } = COPY[purpose];
  await dbWrite.batch([
    { sql: 'DELETE FROM auth_codes WHERE email = ? AND purpose = ? AND created_at <= ?', args: [email, purpose, now - 60 * 60 * 1000] },
    { sql: 'INSERT INTO auth_codes (email, purpose, code_hash, expires_at, created_at) VALUES (?,?,?,?,?)', args: [email, purpose, hashCode(email, purpose, code), now + CODE_TTL_MS, now] },
  ], 'write');

  try {
    await sendEmail({
      to: email,
      subject,
      fromName: 'Prospekta',
      saveToSent: false,
      text: `${lead}:\n\n${code}\n\nKode berlaku 10 menit. Jika bukan Anda yang meminta, abaikan email ini.`,
      html: `<p>${lead}:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p><p style="color:#64748b">Kode berlaku 10 menit. Jika bukan Anda yang meminta, abaikan email ini.</p>`,
    });
  } catch (e) {
    console.error('Gagal mengirim kode:', e.message);
    await dbWrite.execute({ sql: 'DELETE FROM auth_codes WHERE email = ? AND purpose = ? AND created_at = ?', args: [email, purpose, now] });
    throw fail('Email kode gagal dikirim. Coba lagi sebentar.', 502);
  }
}

async function consumeCode(email, purpose, code) {
  const { rows } = await dbWrite.execute({
    sql: 'SELECT id, code_hash, attempts, expires_at FROM auth_codes WHERE email = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1',
    args: [email, purpose],
  });
  const row = rows[0];
  if (!row || Number(row.expires_at) < Date.now()) throw fail('Kode tidak valid atau sudah kedaluwarsa.', 400);
  if (Number(row.attempts) >= MAX_ATTEMPTS) {
    await dbWrite.execute({ sql: 'DELETE FROM auth_codes WHERE id = ?', args: [row.id] });
    throw fail('Terlalu banyak salah kode. Kode telah hangus demi keamanan, silakan minta kode baru.', 429);
  }

  const given = Buffer.from(hashCode(email, purpose, String(code || '').trim()));
  const real = Buffer.from(row.code_hash);
  if (given.length !== real.length || !timingSafeEqual(given, real)) {
    const nextAttempts = Number(row.attempts) + 1;
    if (nextAttempts >= MAX_ATTEMPTS) {
      await dbWrite.execute({ sql: 'DELETE FROM auth_codes WHERE id = ?', args: [row.id] });
      throw fail('Terlalu banyak salah kode. Kode telah hangus demi keamanan, silakan minta kode baru.', 429);
    }
    await dbWrite.execute({ sql: 'UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?', args: [row.id] });
    throw fail('Kode tidak sesuai.', 400);
  }
  await dbWrite.execute({ sql: 'DELETE FROM auth_codes WHERE email = ? AND purpose = ?', args: [email, purpose] });
}

function checkPassword(pw) {
  if (String(pw || '').length < MIN_PASSWORD) throw fail(`Password minimal ${MIN_PASSWORD} karakter.`, 400);
}

export async function signup({ company_name, address, email, password, latitude, longitude }) {
  await ensureTenantSchema();
  email = normEmail(email);
  if (!validEmail(email)) throw fail('Email tidak valid.', 400);
  checkPassword(password);

  const { rows } = await dbWrite.execute({ sql: 'SELECT email_verified, role FROM users WHERE email = ?', args: [email] });
  if (rows[0]) {
    if (Number(rows[0].email_verified) === 1 || rows[0].role === 'admin') {
      throw fail('Email sudah terdaftar. Silakan masuk atau reset password.', 409);
    }
    await dbWrite.execute({ sql: 'UPDATE users SET password_hash = ? WHERE email = ?', args: [await hashPassword(password), email] });
  } else {
    await provisionTenant({ company_name, address, pic_email: email, password, latitude, longitude, verified: false });
  }
  await issueCode(email, 'verify');
  return { email };
}

export async function resendVerification(email) {
  await ensureTenantSchema();
  email = normEmail(email);
  const { rows } = await dbWrite.execute({ sql: 'SELECT email_verified FROM users WHERE email = ?', args: [email] });
  if (rows[0] && Number(rows[0].email_verified) === 0) await issueCode(email, 'verify');
}

/** Mengembalikan payload sesi user yang baru terverifikasi. */
export async function verifyEmail({ email, code }) {
  await ensureTenantSchema();
  email = normEmail(email);
  await consumeCode(email, 'verify', code);
  await dbWrite.execute({ sql: 'UPDATE users SET email_verified = 1 WHERE email = ?', args: [email] });
  const { rows } = await dbWrite.execute({ sql: 'SELECT id, tenant_id, role FROM users WHERE email = ?', args: [email] });
  if (!rows[0]) throw fail('Akun tidak ditemukan.', 404);
  return { uid: rows[0].id, tid: rows[0].tenant_id, role: rows[0].role };
}

/** Selalu sukses di sisi pemanggil agar tidak membocorkan email mana yang terdaftar. */
export async function requestReset(email) {
  await ensureTenantSchema();
  email = normEmail(email);
  if (!validEmail(email)) return;
  const { rows } = await dbWrite.execute({ sql: 'SELECT 1 FROM users WHERE email = ?', args: [email] });
  if (!rows[0]) return;
  await issueCode(email, 'reset').catch((e) => console.warn('Reset code:', e.message));
}

export async function resetPassword({ email, code, password }) {
  await ensureTenantSchema();
  email = normEmail(email);
  checkPassword(password);
  await consumeCode(email, 'reset', code);
  await dbWrite.execute({
    sql: 'UPDATE users SET password_hash = ?, must_change_password = 0, email_verified = 1 WHERE email = ?',
    args: [await hashPassword(password), email],
  });
}

import { NextResponse } from 'next/server';
import { adminPassword, applySessionCookie, generateSessionToken, signSession } from '@/lib/auth';
import { dbWrite } from '@/lib/db';
import { rateLimit } from '@/lib/account';
import { ensureTenantSchema, verifyPassword } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

const safeEqual = (a, b) => {
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
};

const fail = (error, status, extra = {}) => NextResponse.json({ success: false, error, ...extra }, { status });

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const password = (body.password || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    const remember = body.rememberMe !== false;
    if (!password) return fail('Password wajib diisi.', 400);

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
    rateLimit(`login:ip:${ip}`, 30);
    if (email) rateLimit(`login:email:${email}`, 8);

    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@prospekta.id').trim().toLowerCase();
    const adminPw = (process.env.ADMIN_PASSWORD || 'prospepkta2026!').trim();
    const webmailPw = (process.env.SMTP_PASSWORD || '').trim();

    // 1. Akun Admin Prospekta: cocokkan terhadap ADMIN_PASSWORD dari env.
    const isAdminTarget = !email || email === adminEmail;
    const isMasterPassword = (adminPw && safeEqual(password, adminPw)) || (webmailPw && safeEqual(password, webmailPw));

    if (isAdminTarget && isMasterPassword) {
      ensureTenantSchema().catch((err) => console.error('Background schema init error:', err));
      const token = await signSession({ uid: 'usr_admin', tid: 'tnt_master', role: 'admin', email: adminEmail, name: 'Prospekta Admin' });
      return applySessionCookie(NextResponse.json({ success: true, role: 'admin' }), token, remember);
    }

    if (!email) {
      return fail('Email atau password tidak sesuai.', 401);
    }

    await ensureTenantSchema();
    const { rows } = await dbWrite.execute({
      sql: `SELECT u.id, u.tenant_id, u.role, u.password_hash, u.must_change_password, u.email_verified, t.status
            FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id WHERE u.email = ?`,
      args: [email],
    });
    const u = rows[0];
    const ok = await verifyPassword(password, u?.password_hash || '');
    if (!u || !ok || u.status === 'suspended') return fail('Email atau password tidak sesuai.', 401);
    if (!Number(u.email_verified)) return fail('Email belum diverifikasi.', 403, { needsVerification: true, email });

    const token = await signSession({ uid: u.id, tid: u.tenant_id, role: u.role });
    return applySessionCookie(NextResponse.json({ success: true, role: u.role, mustChangePassword: Boolean(u.must_change_password) }), token, remember);
  } catch (error) {
    if (error.status) return fail(error.message, error.status);
    console.error('Login error:', error);
    return fail('Terjadi kesalahan sistem saat autentikasi.', 500);
  }
}

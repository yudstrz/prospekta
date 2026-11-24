import { NextResponse } from 'next/server';
import { applySessionCookie, signSession } from '@/lib/auth';
import { rateLimit, signup, verifyEmail, resendVerification, requestReset, resetPassword } from '@/lib/account';

export const dynamic = 'force-dynamic';

const ok = (extra = {}) => NextResponse.json({ success: true, ...extra });

const actions = {
  async signup(body) {
    await signup(body);
    return ok({ email: String(body.email).trim().toLowerCase() });
  },
  async verify(body) {
    const session = await verifyEmail(body);
    return applySessionCookie(ok(), await signSession(session));
  },
  async resend(body) {
    await resendVerification(body.email);
    return ok();
  },
  async forgot(body) {
    await requestReset(body.email);
    return ok();
  },
  async reset(body) {
    await resetPassword(body);
    return ok();
  },
};

export async function POST(request, { params }) {
  const { action } = await params;
  const handler = actions[action];
  if (!handler) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
    rateLimit(`${action}:${ip}`, action === 'verify' || action === 'reset' ? 15 : 8);
    return await handler(await request.json().catch(() => ({})));
  } catch (e) {
    if (!e.status) console.error(`Auth ${action} error:`, e);
    return NextResponse.json({ success: false, error: e.status ? e.message : 'Terjadi kesalahan sistem.' }, { status: e.status || 500 });
  }
}

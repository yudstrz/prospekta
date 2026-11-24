import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ success: true, message: 'Berhasil keluar.' });
  response.cookies.delete(AUTH_COOKIE_NAME);
  return response;
}

export async function GET(request) {
  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.delete(AUTH_COOKIE_NAME);
  return response;
}

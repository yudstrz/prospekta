import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, readSession } from './lib/auth';

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

// Akun klien deny-by-default: hanya route yang sudah di-scope per tenant.
const CLIENT_ROUTES = [
  '/api/anchors',
  '/api/geo/',
  '/api/settings',
  '/api/categories',
  '/api/tenant/',
  '/api/telegram/link',
  '/api/reach/',
  '/api/places',
  '/api/scan',
  '/api/export',
  '/api/enrich',
  '/api/sync/',
  '/api/crawl',
  '/api/mcp/',
];
const CLIENT_DENY_ROUTES = [
  '/api/reach/webmail',
];
function isClientAllowed(pathname, method) {
  if (!pathname.startsWith('/api/')) return true;
  if (CLIENT_DENY_ROUTES.some((r) => pathname.startsWith(r))) return false;
  return CLIENT_ROUTES.some((r) => pathname.startsWith(r));
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // 0. Otomatis alihkan URL legacy /customer-reach ke URL bersih tanpa prefix
  if (pathname.startsWith('/customer-reach')) {
    const cleanPath = pathname.replace(/^\/customer-reach/, '') || '/';
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = cleanPath;
    return NextResponse.redirect(redirectUrl);
  }

  // 1. Whitelist: Halaman Publik untuk Prospek, Otentikasi, Tracking, MCP RPC, Webhook Telegram, dan Cron Worker
  if (
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/geo/') ||
    pathname.startsWith('/api/mcp/admin') ||
    pathname.startsWith('/api/mcp/user') ||
    pathname.startsWith('/api/mcp/action') ||
    pathname.startsWith('/api/mcp/openapi') ||
    pathname.startsWith('/p/') ||
    pathname.endsWith('-preview') ||
    pathname.startsWith('/api/cron/') ||
    pathname.startsWith('/api/telegram/webhook') ||
    pathname.startsWith('/api/track') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname.match(/\.(png|jpg|jpeg|svg|webp|ico|css|js)$/)
  ) {
    return NextResponse.next();
  }

  // Jika user sudah login dan membuka /login, langsung arahkan ke Dashboard
  if (pathname === '/login') {
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (await readSession(token)) {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = '/';
      return NextResponse.redirect(homeUrl);
    }
    return NextResponse.next();
  }

  // 2. Evaluasi Sesi Cookie Internal
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = await readSession(token);

  if (session) {
    if (session.role === 'superadmin' || isClientAllowed(pathname, request.method)) {
      return NextResponse.next();
    }
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  // 3. Tangani Request Tidak Terautentikasi
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: Sesi akses telah berakhir atau belum login.' },
      { status: 401 }
    );
  }

  // Redirect browser ke halaman login
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  if (pathname !== '/') {
    loginUrl.searchParams.set('from', pathname);
  }
  return NextResponse.redirect(loginUrl);
}

// Alias for Next.js forward compatibility
export const proxy = middleware;


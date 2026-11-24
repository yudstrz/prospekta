import { dbWrite, dbRead } from '@/lib/db';
import { AUTH_COOKIE_NAME, verifySessionToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// 1x1 transparent GIF bytes
const TRANSPARENT_GIF_BUFFER = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const logId = searchParams.get('id') || searchParams.get('log_id');
    const redirectUrl = searchParams.get('url');
    const isClick = searchParams.get('type') === 'click';

    // 1. FILTER INTERNAL TIM: Jangan hitung jika yang membuka adalah tim internal
    // (Pengecekan via auth cookie session login atau referer internal dashboard/webmail)
    const cookieHeader = request.headers.get('cookie') || '';
    const hasInternalAuthCookie = cookieHeader.includes(AUTH_COOKIE_NAME);
    const referer = (request.headers.get('referer') || '').toLowerCase();
    const isInternalReferer =
      referer.includes('localhost') ||
      
      referer.includes('prospekta.vercel.app') || referer.includes('prospekta.id');

    const isInternalStaff = hasInternalAuthCookie || (referer && isInternalReferer && !isClick);

    if (logId && !isInternalStaff) {
      const nowIso = new Date().toISOString();
      if (isClick && redirectUrl) {
        // Record click
        dbWrite.execute({
          sql: `UPDATE sg_outreach_logs 
                SET clicked_at = COALESCE(clicked_at, ?), 
                    click_count = COALESCE(click_count, 0) + 1 
                WHERE id = ?;`,
          args: [nowIso, logId]
        }).then(async (res) => {
          if (res.rowsAffected > 0) {
            // Log click registered successfully
          }
        }).catch((err) => console.warn('[Track Click Error]:', err.message));
      } else {
        // Record open
        dbWrite.execute({
          sql: `UPDATE sg_outreach_logs 
                SET opened_at = COALESCE(opened_at, ?), 
                    open_count = COALESCE(open_count, 0) + 1 
                WHERE id = ?;`,
          args: [nowIso, logId]
        }).catch((err) => console.warn('[Track Open Error]:', err.message));
      }
    }

    // If click tracking redirect: Validate redirectUrl against Open Redirect (OWASP A01)
    if (isClick && redirectUrl) {
      try {
        const parsed = new URL(redirectUrl, 'https://prospekta.vercel.app');
        const allowedHosts = [
          'prospekta.vercel.app',
          'prospekta.id',
          
          'localhost',
        ];
        if (allowedHosts.includes(parsed.hostname) || parsed.hostname.endsWith('.prospekta.id')) {
          return Response.redirect(parsed.toString(), 302);
        }
      } catch (_) {}
      return Response.redirect('https://prospekta.vercel.app', 302);
    }

    // Otherwise return 1x1 transparent pixel
    return new Response(TRANSPARENT_GIF_BUFFER, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (err) {
    return new Response(TRANSPARENT_GIF_BUFFER, {
      status: 200,
      headers: { 'Content-Type': 'image/gif' }
    });
  }
}


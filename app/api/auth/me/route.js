import { NextResponse } from 'next/server';
import { sessionFromRequest, isSuperadmin } from '@/lib/auth';
import { dbWrite } from '@/lib/db';
import { ensureTenantSchema } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const session = await sessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, session: null }, { status: 401 });
    }

    if (session.role === 'admin') {
      return NextResponse.json({
        success: true,
        session: {
          role: 'admin',
          isAdmin: true,
          isSuperadmin: true,
          uid: session.uid || 'usr_admin',
          email: session.email || 'admin@prospekta.id',
          displayName: session.name || 'Prospekta Admin',
        },
      });
    }

    await ensureTenantSchema();
    const { rows } = await dbWrite.execute({
      sql: `SELECT t.id as tenant_id, t.company_name, t.address, t.latitude, t.longitude, t.status, u.email, u.role
            FROM users u
            LEFT JOIN tenants t ON t.id = u.tenant_id
            WHERE u.id = ? LIMIT 1;`,
      args: [session.uid],
    });
    const user = rows[0] || {};

    return NextResponse.json({
      success: true,
      session: {
        role: session.role,
        isSuperadmin: false,
        uid: session.uid,
        tid: session.tid,
        email: user.email || '',
        company_name: user.company_name || 'Klien',
        address: user.address || '',
        status: user.status || 'trial',
      },
    });
  } catch (err) {
    console.error('Session error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

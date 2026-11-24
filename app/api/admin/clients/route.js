import { NextResponse } from 'next/server';
import { sessionFromRequest, isSuperadmin } from '@/lib/auth';
import { provisionTenant, ensureTenantSchema } from '@/lib/tenant';
import { dbWrite } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (!isSuperadmin(await sessionFromRequest(request))) {
    return NextResponse.json({ success: false, error: 'Hanya superadmin.' }, { status: 403 });
  }
  try {
    await ensureTenantSchema();
    const { rows } = await dbWrite.execute(`
      SELECT t.id, t.company_name, t.address, t.latitude, t.longitude, t.status, t.created_at,
             u.email as pic_email
      FROM tenants t
      LEFT JOIN users u ON u.tenant_id = t.id AND u.role = 'client_admin'
      ORDER BY t.created_at DESC
    `);
    return NextResponse.json({ success: true, clients: rows || [] });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isSuperadmin(await sessionFromRequest(request))) {
    return NextResponse.json({ success: false, error: 'Hanya superadmin.' }, { status: 403 });
  }
  try {
    const data = await provisionTenant(await request.json().catch(() => ({})));
    return NextResponse.json({
      success: true,
      data: {
        ...data,
        credentials: {
          ...data.credentials,
          login_url: `${new URL(request.url).origin}/login`,
        },
      },
    }, { status: 201 });
  } catch (e) {
    if (!e.status) console.error('Provision error:', e);
    return NextResponse.json({ success: false, error: e.message }, { status: e.status || 500 });
  }
}

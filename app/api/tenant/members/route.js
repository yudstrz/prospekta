import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { sessionFromRequest, isSuperadmin } from '@/lib/auth';
import { dbWrite } from '@/lib/db';
import { ensureTenantSchema, hashPassword } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

async function resolveTenantId(session, request) {
  if (!session) return null;
  if (isSuperadmin(session)) {
    const url = new URL(request.url);
    return url.searchParams.get('tenant_id') || null;
  }
  return session.tid || null;
}

export async function GET(request) {
  try {
    const session = await sessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const tid = await resolveTenantId(session, request);
    if (!tid) {
      return NextResponse.json({ success: false, error: 'Tenant ID diperlukan.' }, { status: 400 });
    }

    await ensureTenantSchema();
    const { rows } = await dbWrite.execute({
      sql: `SELECT id, email, role, email_verified, created_at
            FROM users
            WHERE tenant_id = ?
            ORDER BY created_at ASC;`,
      args: [tid],
    });

    return NextResponse.json({ success: true, members: rows || [] });
  } catch (err) {
    console.error('Fetch members error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await sessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Hanya client_admin atau superadmin yang boleh menambah staf
    if (session.role !== 'client_admin' && !isSuperadmin(session)) {
      return NextResponse.json({ success: false, error: 'Hanya Admin yang dapat mengundang anggota tim.' }, { status: 403 });
    }

    const tid = await resolveTenantId(session, request);
    if (!tid) {
      return NextResponse.json({ success: false, error: 'Tenant ID diperlukan.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '').trim();
    const role = body.role === 'client_admin' ? 'client_admin' : 'client_sales';

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ success: false, error: 'Alamat email tidak valid.' }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ success: false, error: 'Password minimal 8 karakter.' }, { status: 400 });
    }

    await ensureTenantSchema();

    // Cek apakah email sudah terdaftar
    const existing = await dbWrite.execute({
      sql: 'SELECT id FROM users WHERE email = ? LIMIT 1;',
      args: [email],
    });
    if (existing.rows?.length) {
      return NextResponse.json({ success: false, error: 'Email sudah terdaftar dalam sistem.' }, { status: 409 });
    }

    const newUserId = `usr_${randomBytes(4).toString('hex')}`;
    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();

    await dbWrite.execute({
      sql: `INSERT INTO users (id, tenant_id, email, password_hash, role, must_change_password, email_verified, created_at)
            VALUES (?, ?, ?, ?, ?, 0, 1, ?);`,
      args: [newUserId, tid, email, passwordHash, role, now],
    });

    return NextResponse.json({
      success: true,
      member: {
        id: newUserId,
        email,
        role,
        created_at: now,
      },
    }, { status: 201 });
  } catch (err) {
    console.error('Add member error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await sessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (session.role !== 'client_admin' && !isSuperadmin(session)) {
      return NextResponse.json({ success: false, error: 'Hanya Admin yang dapat menghapus anggota tim.' }, { status: 403 });
    }

    const tid = await resolveTenantId(session, request);
    if (!tid) {
      return NextResponse.json({ success: false, error: 'Tenant ID diperlukan.' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('id');

    if (!memberId) {
      return NextResponse.json({ success: false, error: 'Parameter id diperlukan.' }, { status: 400 });
    }

    // Mencegah menghapus akun sendiri
    if (memberId === session.uid) {
      return NextResponse.json({ success: false, error: 'Anda tidak dapat menghapus akun Anda sendiri.' }, { status: 400 });
    }

    await ensureTenantSchema();
    const result = await dbWrite.execute({
      sql: 'DELETE FROM users WHERE id = ? AND tenant_id = ?;',
      args: [memberId, tid],
    });

    if (!result.rowsAffected) {
      return NextResponse.json({ success: false, error: 'Anggota tim tidak ditemukan.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Anggota tim berhasil dihapus.' });
  } catch (err) {
    console.error('Delete member error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

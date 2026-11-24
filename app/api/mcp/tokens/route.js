import { NextResponse } from 'next/server';
import { sessionFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import { hashMcpToken, generateMcpTokenString } from '@/lib/mcp/auth';

export const dynamic = 'force-dynamic';

/**
 * GET: Ambil daftar token MCP milik akun yang sedang login
 */
export async function GET(request) {
  try {
    const session = await sessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const res = await db.execute({
      sql: `
        SELECT id, label, token_prefix, scope, expires_at, last_used_at, revoked_at, created_at
        FROM mcp_tokens
        WHERE user_id = ?
        ORDER BY created_at DESC;
      `,
      args: [session.uid]
    });

    return NextResponse.json({
      success: true,
      role: session.role,
      tokens: res.rows || []
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST: Buat token MCP baru sesuai peran akun (admin -> psk_adm_..., user -> psk_usr_...)
 */
export async function POST(request) {
  try {
    const session = await sessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const label = (body.label || 'Koneksi AI MCP').trim();
    const role = session.role === 'admin' ? 'admin' : 'user';

    const rawToken = generateMcpTokenString(role);
    const tokenHash = hashMcpToken(rawToken);
    const tokenId = `tok_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const prefix = rawToken.slice(0, 12) + '...';

    await db.execute({
      sql: `
        INSERT INTO mcp_tokens (id, user_id, label, token_hash, token_prefix, scope)
        VALUES (?, ?, ?, ?, ?, ?);
      `,
      args: [tokenId, session.uid, label, tokenHash, prefix, role]
    });

    return NextResponse.json({
      success: true,
      token: rawToken,
      tokenId,
      label,
      scope: role,
      message: 'Simpan token ini sekarang. Token hanya ditampilkan sekali demi keamanan.'
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * DELETE: Cabut (revoke) token MCP
 */
export async function DELETE(request) {
  try {
    const session = await sessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get('id');

    if (!tokenId) {
      return NextResponse.json({ success: false, error: 'Parameter id token diperlukan.' }, { status: 400 });
    }

    const check = await db.execute({
      sql: `SELECT user_id FROM mcp_tokens WHERE id = ? LIMIT 1;`,
      args: [tokenId]
    });

    const tokenRow = check.rows?.[0];
    if (!tokenRow) {
      return NextResponse.json({ success: false, error: 'Token tidak ditemukan.' }, { status: 404 });
    }

    if (tokenRow.user_id !== session.uid && session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Akses ditolak.' }, { status: 403 });
    }

    await db.execute({
      sql: `UPDATE mcp_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?;`,
      args: [tokenId]
    });

    return NextResponse.json({ success: true, message: 'Token MCP berhasil dicabut.' });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

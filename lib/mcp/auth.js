import crypto from 'crypto';
import { db } from '../db.js';

export function hashMcpToken(token) {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

export function generateMcpTokenString(role = 'user') {
  const prefix = role === 'admin' ? 'psk_adm_' : 'psk_usr_';
  const randomBytes = crypto.randomBytes(24).toString('base64url');
  return `${prefix}${randomBytes}`;
}

/**
 * Memvalidasi Bearer token MCP dan memastikan hak akses RBAC sesuai scope yang diminta.
 */
export async function authenticateMcpRequest(request, requiredScope = 'user') {
  const authHeader = request.headers.get('authorization') || '';
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token') || url.searchParams.get('key') || '';

  let rawToken = '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    rawToken = authHeader.slice(7).trim();
  } else if (queryToken) {
    rawToken = queryToken.trim();
  }

  // Juga izinkan session cookie jika dipanggil dari browser UI yang sudah login
  if (!rawToken) {
    const { sessionFromRequest } = await import('../auth.js');
    const session = await sessionFromRequest(request);
    if (session) {
      if (requiredScope === 'admin' && session.role !== 'admin') {
        const err = new Error('Hak akses Admin diperlukan untuk endpoint MCP ini.');
        err.statusCode = 403;
        throw err;
      }
      return {
        userId: session.uid || 'usr_session',
        role: session.role || 'user',
        email: session.email || '',
        name: session.displayName || session.name || 'User',
        tokenId: 'session_internal'
      };
    }

    const err = new Error('Token MCP tidak ditemukan. Sertakan header "Authorization: Bearer <psk_token>".');
    err.statusCode = 401;
    throw err;
  }

  const tokenHash = hashMcpToken(rawToken);

  // Cek token di tabel mcp_tokens dan status user di tabel users
  const res = await db.execute({
    sql: `
      SELECT 
        t.id as token_id,
        t.user_id,
        t.scope,
        t.expires_at,
        t.revoked_at,
        u.email,
        u.email as name,
        u.role as user_role,
        COALESCE(u.email_verified, 1) as is_active
      FROM mcp_tokens t
      JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ?
      LIMIT 1;
    `,
    args: [tokenHash]
  });

  const record = res.rows?.[0];

  if (!record) {
    // Fallback: Dukung master token ADMIN_PASSWORD langsung untuk kemudahan setup awal
    const masterPass = process.env.ADMIN_PASSWORD;
    if (masterPass && rawToken === masterPass) {
      return {
        userId: 'usr_admin_master',
        role: 'admin',
        email: process.env.ADMIN_EMAIL || 'admin@prospekta.id',
        name: 'Prospekta Master Admin',
        tokenId: 'master_key'
      };
    }

    const err = new Error('Token MCP tidak valid atau telah dicabut.');
    err.statusCode = 401;
    throw err;
  }

  if (record.revoked_at) {
    const err = new Error('Token MCP ini telah dicabut (revoked).');
    err.statusCode = 401;
    throw err;
  }

  if (record.expires_at && new Date(record.expires_at).getTime() < Date.now()) {
    const err = new Error('Token MCP ini telah kedaluwarsa.');
    err.statusCode = 401;
    throw err;
  }

  if (!record.is_active) {
    const err = new Error('Akun pengguna terkait telah dinonaktifkan.');
    err.statusCode = 403;
    throw err;
  }

  const effectiveRole = record.user_role === 'admin' ? 'admin' : 'user';

  // Penegakan RBAC untuk endpoint Admin
  if (requiredScope === 'admin' && (effectiveRole !== 'admin' || record.scope !== 'admin')) {
    const err = new Error('Akses ditolak. Token ini tidak memiliki hak akses MCP Admin.');
    err.statusCode = 403;
    throw err;
  }

  // Update last_used_at secara asynchronous
  db.execute({
    sql: `UPDATE mcp_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?;`,
    args: [record.token_id]
  }).catch(() => {});

  return {
    userId: record.user_id,
    role: effectiveRole,
    email: record.email,
    name: record.name,
    tokenId: record.token_id
  };
}

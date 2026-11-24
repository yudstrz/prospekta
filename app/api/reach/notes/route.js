import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sessionFromRequest } from '@/lib/auth';
import { ensureTenantSchema } from '@/lib/tenant';

export async function GET(request) {
  try {
    const session = await sessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    await ensureTenantSchema();
    const { searchParams } = new URL(request.url);
    const placeId = searchParams.get('placeId');

    if (!placeId) {
      return NextResponse.json({ success: false, error: 'Parameter placeId diperlukan.' }, { status: 400 });
    }

    const tid = session?.tid || null;

    let sql = `SELECT * FROM business_notes WHERE place_id = ?`;
    const args = [placeId];

    if (tid) {
      sql += ` AND tenant_id = ?`;
      args.push(tid);
    } else {
      sql += ` AND (tenant_id IS NULL OR tenant_id = 'tnt_master' OR tenant_id = '')`;
    }
    sql += ` ORDER BY created_at DESC;`;

    const res = await db.execute({ sql, args });

    return NextResponse.json({ success: true, notes: res.rows || [] });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await sessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    await ensureTenantSchema();
    const body = await request.json().catch(() => ({}));
    const { placeId, content, author } = body;

    if (!placeId || !content?.trim()) {
      return NextResponse.json({ success: false, error: 'Parameter placeId dan isi catatan diperlukan.' }, { status: 400 });
    }

    const tid = session?.tid || null;
    const defaultAuthor = session?.email ? session.email.split('@')[0] : 'Tim Kami';
    const noteAuthor = author && author.trim() ? author.trim() : defaultAuthor;

    const cleanContent = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').trim().slice(0, 5000);
    const cleanAuthor = noteAuthor.replace(/<[^>]*>/g, '').trim().slice(0, 100);

    const noteId = `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();

    await db.execute({
      sql: `
        INSERT INTO business_notes (id, place_id, content, author, created_at, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?);
      `,
      args: [noteId, placeId, cleanContent, cleanAuthor, nowIso, tid || 'tnt_master']
    });

    return NextResponse.json({
      success: true,
      note: {
        id: noteId,
        place_id: placeId,
        content: cleanContent,
        author: cleanAuthor,
        created_at: nowIso,
        tenant_id: tid || 'tnt_master'
      }
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

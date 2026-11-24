import { NextResponse } from 'next/server';
import { dbWrite, invalidateCache } from '@/lib/db';
import { sessionFromRequest } from '@/lib/auth';

const VALID_STATUSES = [
  'new',
  'analyzed',
  'proposal_draft',
  'sent',
  'replied',
  'meeting',
  'won',
  'lost'
];

export async function POST(request) {
  try {
    const session = await sessionFromRequest(request);
    const tid = session?.tid || null;
    const body = await request.json().catch(() => ({}));
    const { placeId, status } = body;

    if (!placeId || !status) {
      return NextResponse.json({ success: false, error: 'Parameter placeId dan status diperlukan.' }, { status: 400 });
    }

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({
        success: false,
        error: `Status tidak valid. Harus salah satu dari: ${VALID_STATUSES.join(', ')}`
      }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    await dbWrite.execute({
      sql: `
        INSERT INTO places_status_overlay (place_id, reach_status, updated_at, tenant_id)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(place_id) DO UPDATE SET
          reach_status = excluded.reach_status,
          updated_at = excluded.updated_at,
          tenant_id = excluded.tenant_id;
      `,
      args: [placeId, status, nowIso, tid || 'tnt_master']
    });

    invalidateCache();

    return NextResponse.json({ success: true, placeId, status });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

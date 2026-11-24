import { NextResponse } from 'next/server';
import { db, invalidateCache } from '@/lib/db';
import { enrichWebsite } from '@/lib/enrich';
import { sessionFromRequest } from '@/lib/auth';
import { consumeTenantQuota } from '@/lib/tenant';

export async function POST(request) {
  try {
    const session = await sessionFromRequest(request);
    const tid = session?.tid || null;
    const body = await request.json().catch(() => ({}));
    const limit = Math.min(Math.max(parseInt(body.limit || '10', 10), 1), tid ? 15 : 50);
    const anchor = body.anchor;

    if (tid) {
      await consumeTenantQuota(tid, 'enrich');
    }

    const conditions = ["enrich_status = 'pending'", "website IS NOT NULL", "website != ''"];
    const args = [];

    if (tid) {
      conditions.push('anchor IN (SELECT name FROM anchors WHERE tenant_id = ?)');
      args.push(tid);
    } else {
      conditions.push('(anchor IN (SELECT name FROM anchors WHERE tenant_id IS NULL) OR anchor NOT IN (SELECT name FROM anchors WHERE tenant_id IS NOT NULL))');
    }

    if (anchor && anchor !== 'all') {
      conditions.push('anchor = ?');
      args.push(anchor);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const sql = `
      SELECT overture_id, name, website, phone, email, whatsapp, linkedin_url, pic_name
      FROM places
      ${whereClause}
      LIMIT ?;
    `;
    args.push(limit);

    const pendingRes = await db.execute({ sql, args });
    const pendingPlaces = pendingRes.rows || [];

    if (pendingPlaces.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Tidak ada tempat pending dengan website untuk dienrich.',
        processed: 0,
        enriched: 0
      });
    }

    let processedCount = 0;
    let enrichedCount = 0;

    for (const place of pendingPlaces) {
      processedCount++;
      const res = await enrichWebsite(place.website);

      let newEmail = place.email;
      let newEmailSource = place.email ? 'overture' : null;
      let newPhone = place.phone;
      let status = 'done';

      if (res.email && !place.email) {
        newEmail = res.email;
        newEmailSource = 'website';
        enrichedCount++;
      }

      if (res.phone && !place.phone) {
        newPhone = res.phone;
      }

      const newWa = res.whatsapp || place.whatsapp || null;
      const newLi = res.linkedin_url || place.linkedin_url || null;
      const newPic = res.pic_name || place.pic_name || null;

      if (res.status === 'failed' && !res.email && !res.phone && !newWa) {
        status = 'failed';
      }

      await db.execute({
        sql: `
          UPDATE places
          SET 
            email = ?,
            email_source = ?,
            phone = ?,
            whatsapp = ?,
            linkedin_url = ?,
            pic_name = ?,
            enrich_status = ?
          WHERE overture_id = ?;
        `,
        args: [newEmail, newEmailSource, newPhone, newWa, newLi, newPic, status, place.overture_id]
      });
    }

    invalidateCache();

    return NextResponse.json({
      success: true,
      processed: processedCount,
      enriched: enrichedCount,
      remainingCount: Math.max(0, pendingPlaces.length - processedCount)
    });
  } catch (error) {
    if (!error.status) console.error('Enrichment error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: error.status || 500 });
  }
}

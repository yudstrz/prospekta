import { NextResponse } from 'next/server';
import { db, dbWrite, invalidateCache } from '@/lib/db';
import { sessionFromRequest } from '@/lib/auth';

const cleanStr = (val, max = 250) => {
  if (!val || typeof val !== 'string') return null;
  const s = val.replace(/<[^>]*>/g, '').replace(/[\x00-\x1F]/g, '').trim();
  return s ? s.slice(0, max) : null;
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const placeId = searchParams.get('placeId');

    if (!placeId) {
      return NextResponse.json({ success: false, error: 'Parameter placeId diperlukan.' }, { status: 400 });
    }

    const placeRes = await db.execute({
      sql: 'SELECT overture_id, name, website, pic_name, phone, email, linkedin_url FROM places WHERE overture_id = ? LIMIT 1;',
      args: [placeId]
    });

    if (!placeRes.rows || placeRes.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Data perusahaan tidak ditemukan.' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      place: placeRes.rows[0]
    });
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

    const body = await request.json().catch(() => ({}));
    const { action, placeId, pic_name, pic_title, phone, phone_secondary, email, linkedin_url, pic_linkedin_url } = body;

    if (!placeId) {
      return NextResponse.json({ success: false, error: 'Parameter placeId diperlukan.' }, { status: 400 });
    }

    if (action === 'verify_lead') {
      const nowIso = new Date().toISOString();
      const sPic = cleanStr(body.picName, 100);
      const sDmName = cleanStr(body.dmName, 100);
      const sDmTitle = cleanStr(body.dmTitle, 100);
      const sEmail = cleanStr(body.verifiedEmail, 120);
      const sPhone = cleanStr(body.phone, 40);
      const sBudget = cleanStr(body.budgetCapacity, 40) || 'medium';
      const sBudgetNotes = cleanStr(body.budgetNotes, 300);
      const sWebCond = cleanStr(body.websiteCondition, 40) || 'none';
      const sSocCond = cleanStr(body.socialCondition, 40) || 'inactive';
      const sAngle = cleanStr(body.offerAngle, 60) || 'digital_structure';
      const sNotes = cleanStr(body.notes, 1000);
      const tid = session?.tid || 'tnt_master';

      await dbWrite.batch([
        {
          sql: `UPDATE places SET
                  is_personal_lead = 1,
                  contact_verified = 1,
                  assigned_pic = COALESCE(?, assigned_pic),
                  pic_name = COALESCE(?, pic_name),
                  pic_title = COALESCE(?, pic_title),
                  email = COALESCE(?, email),
                  phone = COALESCE(?, phone),
                  budget_capacity = ?,
                  budget_notes = ?,
                  website_condition = ?,
                  social_condition = ?,
                  offer_angle = ?,
                  notes = ?,
                  sg_notes = ?,
                  lead_verified_at = ?,
                  reach_status = CASE WHEN COALESCE(reach_status, 'new') = 'new' THEN 'analyzed' ELSE reach_status END
                WHERE overture_id = ?;`,
          args: [sPic, sDmName, sDmTitle, sEmail, sPhone, sBudget, sBudgetNotes, sWebCond, sSocCond, sAngle, sNotes, sNotes, nowIso, placeId],
        },
        {
          sql: `INSERT INTO places_status_overlay (place_id, reach_status, assigned_pic, pic_name, pic_title, notes, updated_at, tenant_id)
                VALUES (?, 'analyzed', ?, ?, ?, ?, ?, ?)
                ON CONFLICT(place_id) DO UPDATE SET
                  assigned_pic = COALESCE(excluded.assigned_pic, places_status_overlay.assigned_pic),
                  pic_name = COALESCE(excluded.pic_name, places_status_overlay.pic_name),
                  pic_title = COALESCE(excluded.pic_title, places_status_overlay.pic_title),
                  notes = COALESCE(excluded.notes, places_status_overlay.notes),
                  updated_at = excluded.updated_at;`,
          args: [placeId, sPic, sDmName, sDmTitle, sNotes, nowIso, tid],
        },
      ], 'write');
      invalidateCache();
      return NextResponse.json({ success: true, message: 'Verifikasi lead dan audit 3 pilar berhasil disimpan.' });
    }

    const sName = cleanStr(pic_name, 100);
    const sTitle = cleanStr(pic_title, 100);
    const sPhone = cleanStr(phone, 40);
    const sPhoneSec = cleanStr(phone_secondary, 40);
    const sEmail = cleanStr(email, 120);
    const sLi = cleanStr(linkedin_url, 300);
    const sPicLi = cleanStr(pic_linkedin_url, 300);

    await db.execute({
      sql: `
        UPDATE places SET
          pic_name = ?,
          pic_title = ?,
          phone = ?,
          phone_secondary = ?,
          email = ?,
          linkedin_url = ?,
          pic_linkedin_url = ?
        WHERE overture_id = ?;
      `,
      args: [sName, sTitle, sPhone, sPhoneSec, sEmail, sLi, sPicLi, placeId]
    });

    return NextResponse.json({
      success: true,
      updated: { placeId, pic_name: sName, pic_title: sTitle, phone: sPhone, phone_secondary: sPhoneSec, email: sEmail, linkedin_url: sLi, pic_linkedin_url: sPicLi }
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

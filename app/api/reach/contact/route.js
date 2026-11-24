import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { lookupApolloPerson } from '@/lib/apollo';
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
    const lookup = searchParams.get('lookup');

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

    const place = placeRes.rows[0];

    // If requesting Apollo lookup explicitly
    if (lookup === 'apollo') {
      const apolloRes = await lookupApolloPerson({
        companyName: place.name,
        domain: place.website
      });

      if (apolloRes.success && apolloRes.person) {
        // Automatically save to database
        await db.execute({
          sql: `
            UPDATE places SET
              pic_name = COALESCE(?, pic_name),
              email = COALESCE(?, email),
              phone = COALESCE(?, phone),
              linkedin_url = COALESCE(?, linkedin_url)
            WHERE overture_id = ?;
          `,
          args: [
            apolloRes.person.name,
            apolloRes.person.email,
            apolloRes.person.phone,
            apolloRes.person.linkedin_url,
            placeId
          ]
        });

        return NextResponse.json({
          success: true,
          person: apolloRes.person,
          source: 'apollo_api',
          message: 'Data PIC berhasil ditemukan dari Apollo.io.'
        });
      }

      // If Apollo API returned 403 or error
      return NextResponse.json({
        success: false,
        status: apolloRes.status,
        error: apolloRes.error || apolloRes.reason || 'PIC tidak ditemukan di Apollo.io.',
        isFreePlan: apolloRes.status === 403,
        suggestion: 'Akun Apollo Free membatasi pencarian via backend API. Gunakan tombol Apollo Web / LinkedIn untuk menyalin nama PIC 1-klik.'
      });
    }

    return NextResponse.json({
      success: true,
      place
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
    const { placeId, pic_name, pic_title, phone, phone_secondary, email, linkedin_url, pic_linkedin_url } = body;

    if (!placeId) {
      return NextResponse.json({ success: false, error: 'Parameter placeId diperlukan.' }, { status: 400 });
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

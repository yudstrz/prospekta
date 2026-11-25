import { NextResponse } from 'next/server';
import { db, dbWrite, invalidateCache } from '@/lib/db';
import { sessionFromRequest } from '@/lib/auth';
import { generatePrebuiltSiteConfig } from '@/lib/llm';
import { crawlCompanyWebsite } from '@/lib/crawler';

export async function GET(request) {
  try {
    const session = await sessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const placeId = (searchParams.get('placeId') || '').trim();
    if (!placeId) {
      return NextResponse.json({ success: false, error: 'Parameter placeId diperlukan.' }, { status: 400 });
    }
    const tid = session.tid || null;
    const isClient = Boolean(tid && tid !== 'tnt_master');
    const logsRes = await dbWrite.execute({
      sql: isClient
        ? `SELECT id, pic_name, sender_email, recipient_email, sent_date, subject, status, created_at FROM sg_outreach_logs WHERE place_id = ? AND tenant_id = ? ORDER BY created_at DESC;`
        : `SELECT id, pic_name, sender_email, recipient_email, sent_date, subject, status, created_at FROM sg_outreach_logs WHERE place_id = ? AND (tenant_id IS NULL OR tenant_id = 'tnt_master' OR tenant_id = '') ORDER BY created_at DESC;`,
      args: isClient ? [placeId, tid] : [placeId],
    }).catch(() => ({ rows: [] }));

    return NextResponse.json({ success: true, logs: logsRes.rows || [] });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

function resolveOutreachStrategy(place) {
  return { segment: 'general', angle: place?.offer_angle || 'digital_structure' };
}

function buildSgExecutiveEmail({ companyName, offerAngle }) {
  return {
    subject: `Partnership proposal for ${companyName}`,
    body: `Hello ${companyName} team, we would love to connect regarding digital solutions.`,
    angle: offerAngle || 'digital_structure'
  };
}

/**
 * API Workflow Outreach Terpadu & Bebas Duplikasi
 * Alur:
 * 1. Cek status prospek (apakah website sudah pernah dibuat? apakah email sudah terkirim?)
 * 2. Generate website preview HANYA jika belum ada (mencegah duplikasi slug & konten)
 * 3. Rumuskan draf email eksekutif sesuai SOP 20261020 (Bebas emoji, bebas em dash)
 * 4. Perbarui status pipeline di places & prebuilt_websites secara atomik
 */
export async function POST(request) {
  try {
    const session = await sessionFromRequest(request);
    const tid = session?.tid || 'tnt_master';
    const body = await request.json().catch(() => ({}));
    const {
      placeId,
      picName,
      dmName,
      dmTitle,
      verifiedEmail,
      recipientEmail,
      recipientName,
      offerAngle,
      subject,
      bodyText,
      allowFollowup,
      websiteCondition,
      observedBottleneck,
      lang = 'en',
      action = 'draft_and_check' // 'draft_and_check' | 'generate_and_log' | 'log_outreach'
    } = body;

    if (!placeId) {
      return NextResponse.json({ success: false, error: 'Parameter placeId diperlukan.' }, { status: 400 });
    }

    if (action === 'log_outreach') {
      const target = String(recipientEmail || verifiedEmail || '').trim().toLowerCase();
      const today = new Date().toISOString().slice(0, 10);
      const nowIso = new Date().toISOString();
      const dupCheck = await dbWrite.execute({
        sql: `SELECT id FROM sg_outreach_logs WHERE place_id = ? LIMIT 1;`,
        args: [placeId],
      }).catch(() => ({ rows: [] }));
      if ((dupCheck.rows?.length || 0) > 0 && !allowFollowup) {
        return NextResponse.json({
          success: false,
          error: 'Outreach sudah pernah tercatat untuk prospek ini. Centang izinkan follow-up jika ingin mencatat ulang.',
        }, { status: 409 });
      }
      const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await dbWrite.batch([
        {
          sql: `INSERT INTO sg_outreach_logs (
                  id, place_id, pic_name, sender_email, recipient_email, recipient_name,
                  offer_angle, subject, body_text, status, sent_date, created_at, tenant_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?);`,
          args: [
            logId,
            placeId,
            picName || 'Tim Outreach',
            session?.email || 'admin@prospekta.id',
            target,
            recipientName || dmName || 'Management',
            offerAngle || 'digital_structure',
            subject || '',
            bodyText || '',
            today,
            nowIso,
            tid,
          ],
        },
        {
          sql: `UPDATE places SET reach_status = 'sent', last_outreach_at = ?, outreach_count = COALESCE(outreach_count, 0) + 1 WHERE overture_id = ?;`,
          args: [today, placeId],
        },
        {
          sql: `INSERT INTO places_status_overlay (place_id, reach_status, last_outreach_at, updated_at, tenant_id)
                VALUES (?, 'sent', ?, ?, ?)
                ON CONFLICT(place_id) DO UPDATE SET
                  reach_status = 'sent',
                  last_outreach_at = excluded.last_outreach_at,
                  updated_at = excluded.updated_at,
                  tenant_id = excluded.tenant_id;`,
          args: [placeId, today, nowIso, tid],
        },
      ], 'write');
      invalidateCache();
      return NextResponse.json({
        success: true,
        logId,
        message: 'Log outreach berhasil dicatat dan status prospek diperbarui ke Terkirim.',
      });
    }

    // 1. Ambil data tempat usaha terkini
    const placeRes = await db.execute({
      sql: `SELECT * FROM places WHERE overture_id = ?;`,
      args: [placeId]
    });
    const place = placeRes.rows?.[0];
    if (!place) {
      return NextResponse.json({ success: false, error: 'Perusahaan tidak ditemukan.' }, { status: 404 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    const requestBaseUrl = host ? `${proto}://${host}` : null;
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL && !process.env.NEXT_PUBLIC_BASE_URL.includes('localhost'))
      ? process.env.NEXT_PUBLIC_BASE_URL.replace(/\/+$/, '')
      : (requestBaseUrl || 'https://prospektas.vercel.app');

    // 2. Cek Riwayat Pengiriman Email (Deduplikasi Outreach)
    const targetEmail = (verifiedEmail || place.email || '').trim().toLowerCase();
    const existingLogsRes = await db.execute({
      sql: `SELECT id, pic_name, recipient_email, sent_date, subject, created_at FROM sg_outreach_logs WHERE place_id = ? OR (recipient_email = ? AND recipient_email != '') ORDER BY created_at DESC;`,
      args: [placeId, targetEmail]
    });
    const existingLogs = existingLogsRes.rows || [];
    const isEmailAlreadySent = existingLogs.length > 0 || place.reach_status === 'sent';

    // 3. Cek Riwayat Website Preview (Deduplikasi Generator)
    const existingSiteRes = await db.execute({
      sql: `SELECT * FROM prebuilt_websites WHERE place_id = ? ORDER BY created_at DESC LIMIT 1;`,
      args: [placeId]
    });
    let site = existingSiteRes.rows?.[0] || null;
    let siteAction = site ? 'skipped_existing' : 'pending';

    // Tentukan sudut penawaran & kondisi web berdasarkan strategi segmentasi Singapura
    // Segmen 1 (Bisnis Lokal): Website sebagai entri level, Digital Growth, AI Automation
    // Segmen 2 (Klinik Kesehatan): Solusi tunggal paling relevan (Digital Growth & AI Automation)
    const strategy = resolveOutreachStrategy(place);
    const isClinic = strategy.segment === 'healthcare_clinic';
    const resolvedWebCondition = websiteCondition
      || place.website_condition
      || (place.website ? 'outdated' : 'none');
    const resolvedOfferAngle = offerAngle
      || (isClinic ? 'agentic_ai' : (place.offer_angle || strategy.angle));

    // Buat website preview jika belum ada dan sudut penawaran membutuhkan website
    if (!site && (resolvedOfferAngle === 'digital_structure' || resolvedWebCondition === 'none' || resolvedWebCondition === 'outdated')) {
      const slug = Math.random().toString(36).substring(2, 10);

      // Cek apakah ada data analisis intelijen
      const analysisRes = await db.execute({
        sql: `SELECT * FROM analyses WHERE place_id = ? ORDER BY created_at DESC LIMIT 1;`,
        args: [placeId]
      });
      const analysis = analysisRes.rows?.[0] || null;
      let googlePlaceData = null;
      if (analysis?.google_place) {
        try {
          googlePlaceData = typeof analysis.google_place === 'string' ? JSON.parse(analysis.google_place) : analysis.google_place;
        } catch (_) {}
      }

      const googleRating = googlePlaceData?.rating 
        ? Number(googlePlaceData.rating) 
        : (place.confidence ? Number((4.0 + (place.confidence * 0.9)).toFixed(1)) : 4.8);
      const reviewsCount = googlePlaceData?.user_ratings_total 
        ? Number(googlePlaceData.user_ratings_total) 
        : (place.reviews_count || 14);
      const googleReviewsJson = (googlePlaceData?.reviews && googlePlaceData.reviews.length > 0)
        ? JSON.stringify(googlePlaceData.reviews)
        : null;

      let visualAssets = null;
      let webImages = [];
      if (analysis?.search_intelligence) {
        try {
          const si = typeof analysis.search_intelligence === 'string' ? JSON.parse(analysis.search_intelligence) : analysis.search_intelligence;
          visualAssets = si.visualAssets || null;
          webImages = si.images || [];
        } catch (_) {}
      }

      if (!visualAssets && place.website) {
        try {
          const crawlRes = await crawlCompanyWebsite(place.website);
          if (crawlRes?.visualAssets) {
            visualAssets = crawlRes.visualAssets;
          }
        } catch (_) {}
      }

      const siteConfig = await generatePrebuiltSiteConfig({
        name: place.name,
        category: place.bidang_usaha || place.category_raw || 'General Business',
        address: place.address || googlePlaceData?.address || '',
        phone: place.phone || googlePlaceData?.phone || '',
        website: place.website || '',
        summary: analysis?.summary || place.problem_analysis || place.notes || '',
        products: analysis?.products || '',
        googlePlace: googlePlaceData,
        visualAssets,
        webImages,
        rating: googleRating,
        reviewsCount,
        lang
      });

      const siteId = `site_${Date.now()}_${slug}`;
      await db.execute({
        sql: `
          INSERT INTO prebuilt_websites (
            id, place_id, slug, company_name, category, phone, email,
            google_rating, reviews_count, google_reviews_json, services_json, hero_headline, hero_subheadline,
            status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?);
        `,
        args: [
          siteId,
          placeId,
          slug,
          place.name,
          place.bidang_usaha || place.category_raw || '',
          place.phone || '',
          targetEmail,
          googleRating,
          reviewsCount,
          googleReviewsJson,
          JSON.stringify(siteConfig),
          siteConfig.heroHeadline,
          siteConfig.heroSubheadline,
          nowIso
        ]
      });

      // Update kolom tracking di tabel places
      await db.execute({
        sql: `
          UPDATE places 
          SET has_prebuilt_site = 1,
              prebuilt_slug = ?,
              prebuilt_created_at = ?,
              reach_status = CASE WHEN reach_status = 'new' OR reach_status IS NULL THEN 'proposal_draft' ELSE reach_status END
          WHERE overture_id = ?;
        `,
        args: [slug, nowIso, placeId]
      });

      site = {
        id: siteId,
        place_id: placeId,
        slug,
        company_name: place.name,
        status: 'draft',
        created_at: nowIso
      };
      siteAction = 'created_new';
    } else if (site && (!place.has_prebuilt_site || !place.prebuilt_slug)) {
      // Sinkronkan status places jika sebelumnya belum tercatat
      await db.execute({
        sql: `UPDATE places SET has_prebuilt_site = 1, prebuilt_slug = ? WHERE overture_id = ?;`,
        args: [site.slug, placeId]
      });
    }

    const previewUrl = site?.slug ? `${baseUrl}/p/${site.slug}` : '';

    // 4. Susun Komunikasi Eksekutif Standar Prospekta
    const emailResult = buildSgExecutiveEmail({
      companyName: place.name,
      industry: place.bidang_usaha || place.category_raw,
      dmName: dmName || place.pic_name,
      dmTitle: dmTitle || place.pic_title,
      websiteCondition: resolvedWebCondition,
      offerAngle: resolvedOfferAngle,
      observedBottleneck: observedBottleneck || place.notes || place.sg_notes || '',
      previewUrl,
      location: place.address || place.city || 'Singapore',
      lang
    });

    let outreachAction = isEmailAlreadySent ? 'skipped_already_sent' : 'ready_to_send';

    // 5. Jika aksi adalah 'generate_and_log', catat log pengiriman (kecuali jika sudah terkirim tanpa izin)
    if (action === 'generate_and_log') {
      if (isEmailAlreadySent && !body.allowFollowup) {
        outreachAction = 'blocked_duplicate';
      } else {
        const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await db.execute({
          sql: `
            INSERT INTO sg_outreach_logs (
              id, place_id, pic_name, sender_email, recipient_email, recipient_name,
              offer_angle, subject, body_text, status, sent_date, created_at
            ) VALUES (?, ?, ?, 'admin@prospekta.id', ?, ?, ?, ?, ?, 'sent', ?, ?);
          `,
          args: [
            logId,
            placeId,
            picName || place.assigned_pic || 'Prospekta Team',
            targetEmail,
            dmName || place.pic_name || 'Management',
            resolvedOfferAngle,
            emailResult.subject,
            emailResult.body,
            today,
            nowIso
          ]
        });

        await db.execute({
          sql: `
            UPDATE places 
            SET reach_status = 'sent',
                last_outreach_at = ?,
                outreach_count = COALESCE(outreach_count, 0) + 1
            WHERE overture_id = ?;
          `,
          args: [today, placeId]
        });

        if (site?.slug) {
          await db.execute({
            sql: `UPDATE prebuilt_websites SET status = 'sent', sent_at = ? WHERE place_id = ?;`,
            args: [nowIso, placeId]
          });
        }

        outreachAction = 'logged_sent';
      }
    }

    invalidateCache();

    return NextResponse.json({
      success: true,
      placeId,
      companyName: place.name,
      website: {
        hasSite: Boolean(site),
        slug: site?.slug || null,
        previewUrl,
        action: siteAction
      },
      outreach: {
        isAlreadySent,
        outreachCount: existingLogs.length,
        lastSentDate: existingLogs[0]?.sent_date || null,
        action: outreachAction,
        subject: emailResult.subject,
        body: emailResult.body,
        angle: emailResult.angle
      },
      currentReachStatus: action === 'generate_and_log' && outreachAction === 'logged_sent'
        ? 'sent'
        : (site ? 'proposal_draft' : (place.reach_status || 'new'))
    });
  } catch (err) {
    console.error('Workflow execution error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

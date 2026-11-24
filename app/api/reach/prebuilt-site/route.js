import { NextResponse } from 'next/server';
import { db, dbWrite, dbRead, invalidateCache } from '@/lib/db';
import { generatePrebuiltSiteConfig } from '@/lib/llm';
import { crawlCompanyWebsite } from '@/lib/crawler';
import { performCompanyIntelligence } from '@/lib/intelligence';
import { sessionFromRequest } from '@/lib/auth';
import { getSettings, consumeTenantQuota } from '@/lib/tenant';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const placeId = searchParams.get('placeId');

    const rawBaseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://prospektas.vercel.app';
    const baseUrl = rawBaseUrl.replace(/^['"]+|['"]+$/g, '').replace(/\/+$/, '');

    const session = await sessionFromRequest(request);
    const tid = session?.tid || searchParams.get('tenant_id') || null;

    // Skenario 1: Lookup spesifik untuk 1 placeId
    if (placeId) {
      const siteFilter = tid
        ? 'WHERE place_id = ? AND tenant_id = ?'
        : `WHERE place_id = ? AND (tenant_id IS NULL OR tenant_id = 'tnt_master' OR tenant_id = '')`;
      const siteArgs = tid ? [placeId, tid] : [placeId];
      const res = await dbWrite.execute({
        sql: `SELECT * FROM prebuilt_websites ${siteFilter} ORDER BY created_at DESC LIMIT 1;`,
        args: siteArgs
      });

      const site = res.rows?.[0] || null;
      let url = null;
      if (site?.slug) {
        url = `${baseUrl}/p/${site.slug}`;
      }

      return NextResponse.json({ success: true, site, url });
    }

    // Skenario 2: Direktori seluruh website prebuilt yang sudah digenerate
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 200);
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
    const offset = (page - 1) * limit;
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const conditions = ['1=1'];
    const args = [];

    if (tid) {
      conditions.push('tenant_id = ?');
      args.push(tid);
    } else {
      conditions.push(`(tenant_id IS NULL OR tenant_id = 'tnt_master' OR tenant_id = '')`);
    }

    if (status && status !== 'all') {
      if (status === 'sent') {
        conditions.push("status = 'sent'");
      } else if (status === 'draft') {
        conditions.push("status != 'sent'");
      } else {
        conditions.push('status = ?');
        args.push(status);
      }
    }
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push('(company_name LIKE ? OR category LIKE ? OR slug LIKE ?)');
      args.push(q, q, q);
    }

    const whereClause = conditions.join(' AND ');

    // Hitung total prebuilt websites langsung dari dbWrite
    const countRes = await dbWrite.execute({
      sql: `SELECT COUNT(*) as total FROM prebuilt_websites WHERE ${whereClause};`,
      args
    });
    const total = Number(countRes.rows?.[0]?.total || 0);

    // Ambil daftar prebuilt websites dari dbWrite
    const sitesRes = await dbWrite.execute({
      sql: `SELECT * FROM prebuilt_websites WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?;`,
      args: [...args, limit, offset]
    });

    const rawSites = sitesRes.rows || [];
    const placeIds = [...new Set(rawSites.map(s => s.place_id).filter(Boolean))];
    const placesMap = new Map();

    if (placeIds.length > 0) {
      try {
        const placeholders = placeIds.map(() => '?').join(',');
        const pRes = await dbRead.execute({
          sql: `SELECT overture_id, name, bidang_usaha, address, phone, email, reach_status, last_outreach_at, outreach_count, assigned_pic FROM places WHERE overture_id IN (${placeholders});`,
          args: placeIds
        });
        for (const row of pRes.rows || []) {
          placesMap.set(row.overture_id, row);
        }
      } catch (err) {
        console.warn('[PrebuiltSites] Warning fetching places from dbRead:', err.message);
      }
    }

    const sites = rawSites.map(s => {
      const p = placesMap.get(s.place_id) || {};
      return {
        ...s,
        place_name: p.name || s.company_name,
        place_bidang_usaha: p.bidang_usaha || s.category,
        place_address: p.address || '',
        place_phone: p.phone || s.phone,
        place_email: p.email || s.email,
        place_reach_status: p.reach_status || s.status,
        place_last_outreach_at: p.last_outreach_at || s.sent_at,
        place_outreach_count: p.outreach_count || (s.status === 'sent' ? 1 : 0),
        place_assigned_pic: p.assigned_pic || null,
        url: `${baseUrl}/p/${s.slug}`
      };
    });

    return NextResponse.json({
      success: true,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      sites
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' }
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await sessionFromRequest(request);
    const tid = session?.tid || null;
    const body = await request.json().catch(() => ({}));
    const { placeId, lang = 'en', force = false } = body;

    if (!placeId) {
      return NextResponse.json({ success: false, error: 'Parameter placeId diperlukan.' }, { status: 400 });
    }

    if (tid) {
      const tSettings = await getSettings(tid);
      if (tSettings && tSettings.feat_prebuilt_site === 0) {
        return NextResponse.json(
          { success: false, error: 'Modul Website Demo (Prebuilt Sites) sedang dinonaktifkan. Anda dapat mengaktifkannya di menu Pengaturan Akun & Fitur > Fitur & Otomasi.' },
          { status: 403 }
        );
      }
      await consumeTenantQuota(tid, 'ai');
    }

    const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    const requestBaseUrl = host ? `${proto}://${host}` : null;
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL && !process.env.NEXT_PUBLIC_BASE_URL.includes('localhost'))
      ? process.env.NEXT_PUBLIC_BASE_URL.replace(/\/+$/, '')
      : (requestBaseUrl || 'https://prospektas.vercel.app');

    // 1. Ambil data bisnis riil dari database
    const placeRes = await dbWrite.execute({
      sql: `SELECT * FROM places WHERE overture_id = ?;`,
      args: [placeId]
    });
    const place = placeRes.rows?.[0];
    if (!place) {
      return NextResponse.json({ success: false, error: 'Perusahaan tidak ditemukan.' }, { status: 404 });
    }

    // Cek jika prebuilt site sudah pernah digenerate untuk bisnis ini (kecuali force: true)
    const existingRes = await db.execute({
      sql: `SELECT * FROM prebuilt_websites WHERE place_id = ? ORDER BY created_at DESC LIMIT 1;`,
      args: [placeId]
    });
    if (existingRes.rows?.length > 0 && !force) {
      const existing = existingRes.rows[0];
      await db.execute({
        sql: `
          UPDATE places 
          SET has_prebuilt_site = 1,
              prebuilt_slug = ?,
              reach_status = CASE WHEN reach_status = 'new' OR reach_status IS NULL THEN 'proposal_draft' ELSE reach_status END
          WHERE overture_id = ?;
        `,
        args: [existing.slug, placeId]
      });

      return NextResponse.json({
        success: true,
        alreadyGenerated: true,
        site: existing,
        slug: existing.slug,
        previewUrl: `${baseUrl}/p/${existing.slug}`,
        message: 'Website preview sudah pernah dibuat untuk bisnis ini.'
      });
    }

    // 2. Buat slug acak unik atau pertahankan slug yang sudah ada jika force
    const cleanName = (place.name || '')
      .toLowerCase()
      .replace(/\b(pte|ltd|inc|corp|co|tbk|pt|cv|llc|holdings|group)\b/gi, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24);
    const slug = (existingRes.rows?.[0]?.slug) || (cleanName ? `${cleanName}-preview` : `preview-${Math.random().toString(36).substring(2, 8)}`);

    // 3. Ambil data analisis intelijen (Jalankan riset mendalam jika belum pernah dianalisis)
    let analysisRes = await db.execute({
      sql: `SELECT * FROM analyses WHERE place_id = ? ORDER BY created_at DESC LIMIT 1;`,
      args: [placeId]
    });
    let analysis = analysisRes.rows?.[0] || null;

    if (!analysis) {
      try {
        const intel = await performCompanyIntelligence({ placeId, lang });
        if (intel.success && intel.analysis) {
          analysis = intel.analysis;
        }
      } catch (intelErr) {
        console.warn('[PrebuiltSite] Automatic intelligence gathering error:', intelErr.message);
      }
    }

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
    let searchSnippets = [];
    if (analysis?.search_intelligence) {
      try {
        const si = typeof analysis.search_intelligence === 'string' ? JSON.parse(analysis.search_intelligence) : analysis.search_intelligence;
        visualAssets = si.visualAssets || null;
        webImages = si.images || [];
        searchSnippets = si.snippets || [];
        if (si.answer) searchSnippets.unshift(si.answer);
      } catch (_) {}
    }

    let rawText = analysis?.raw_text || '';
    if (place.website) {
      try {
        const crawlRes = await crawlCompanyWebsite(place.website);
        if (crawlRes?.text && crawlRes.text.length > rawText.length) {
          rawText = crawlRes.text;
        }
        if (crawlRes?.visualAssets && !visualAssets) {
          visualAssets = crawlRes.visualAssets;
        }
      } catch (_) {}
    }

    let needs = [];
    if (analysis?.needs) {
      try {
        needs = typeof analysis.needs === 'string' ? JSON.parse(analysis.needs) : analysis.needs;
      } catch (_) {}
    }

    // 4. Susun data landing page profesional dengan LLM
    const siteConfig = await generatePrebuiltSiteConfig({
      name: place.name,
      category: place.bidang_usaha || place.category_raw || 'General Business',
      address: place.address || googlePlaceData?.address || '',
      phone: place.phone || googlePlaceData?.phone || '',
      website: place.website || '',
      summary: analysis?.summary || place.problem_analysis || place.notes || '',
      products: analysis?.products || '',
      rawText,
      searchSnippets,
      needs,
      googlePlace: googlePlaceData,
      visualAssets,
      webImages,
      rating: googleRating,
      reviewsCount,
      lang,
      tenantId: tid
    });

    const siteId = `site_${Date.now()}_${slug}`;
    const nowIso = new Date().toISOString();

    // 5. Simpan ke tabel prebuilt_websites (Hapus yang lama jika force regeneration)
    if (existingRes.rows?.length > 0 && force) {
      await db.execute({
        sql: `DELETE FROM prebuilt_websites WHERE place_id = ?;`,
        args: [placeId]
      });
    }

    await db.execute({
      sql: `
        INSERT INTO prebuilt_websites (
          place_id, slug, company_name, category, industry, phone, email,
          google_rating, reviews_count, google_reviews_json, services_json, hero_headline, hero_subheadline,
          status, created_at, tenant_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
        ON CONFLICT(place_id) DO UPDATE SET
          slug = excluded.slug,
          company_name = excluded.company_name,
          category = excluded.category,
          industry = excluded.industry,
          phone = excluded.phone,
          email = excluded.email,
          google_rating = excluded.google_rating,
          reviews_count = excluded.reviews_count,
          google_reviews_json = excluded.google_reviews_json,
          services_json = excluded.services_json,
          hero_headline = excluded.hero_headline,
          hero_subheadline = excluded.hero_subheadline,
          status = excluded.status,
          created_at = excluded.created_at,
          tenant_id = excluded.tenant_id;
      `,
      args: [
        placeId,
        slug,
        place.name,
        place.bidang_usaha || place.category_raw || '',
        place.bidang_usaha || place.category_raw || '',
        place.phone || '',
        place.email || '',
        googleRating,
        reviewsCount,
        googleReviewsJson,
        JSON.stringify(siteConfig),
        siteConfig.heroHeadline,
        siteConfig.heroSubheadline,
        nowIso,
        tid || 'tnt_master'
      ]
    });

    // 5. Perbarui status tracking di places_status_overlay dan places
    await dbWrite.execute({
      sql: `
        INSERT INTO places_status_overlay (place_id, has_prebuilt_site, prebuilt_slug, prebuilt_created_at, reach_status, updated_at, tenant_id)
        VALUES (?, 1, ?, ?, 'proposal_draft', ?, ?)
        ON CONFLICT(place_id) DO UPDATE SET
          has_prebuilt_site = 1,
          prebuilt_slug = excluded.prebuilt_slug,
          prebuilt_created_at = excluded.prebuilt_created_at,
          reach_status = CASE WHEN places_status_overlay.reach_status = 'new' OR places_status_overlay.reach_status IS NULL THEN 'proposal_draft' ELSE places_status_overlay.reach_status END,
          updated_at = excluded.updated_at,
          tenant_id = excluded.tenant_id;
      `,
      args: [placeId, slug, nowIso, nowIso, tid || 'tnt_master']
    }).catch(() => null);

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

    invalidateCache();

    const previewUrl = `${baseUrl}/p/${slug}`;

    return NextResponse.json({
      success: true,
      alreadyGenerated: false,
      site: {
        id: siteId,
        place_id: placeId,
        slug,
        company_name: place.name,
        hero_headline: siteConfig.heroHeadline,
        hero_subheadline: siteConfig.heroSubheadline,
        status: 'draft'
      },
      slug,
      previewUrl
    });
  } catch (err) {
    if (!err.status) console.error('Error generating prebuilt site:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: err.status || 500 });
  }
}

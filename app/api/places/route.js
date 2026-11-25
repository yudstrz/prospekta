import { NextResponse } from 'next/server';
import { db, dbWrite, cachedExecute, invalidateCache, getStatusOverlayMap } from '@/lib/db';
import { sessionFromRequest } from '@/lib/auth';
import { getSettings } from '@/lib/tenant';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const anchor = searchParams.get('anchor');
    const search = searchParams.get('search');
    const bidangUsaha = searchParams.get('bidang_usaha');
    const enrichStatus = searchParams.get('enrich_status');
    const reachStatus = searchParams.get('reach_status');
    const hasPhone = searchParams.get('has_phone');
    const noPhone = searchParams.get('no_phone');
    const hasWebsite = searchParams.get('has_website');
    const noWebsite = searchParams.get('no_website');
    const hasEmail = searchParams.get('has_email');
    const hasWa = searchParams.get('has_wa');
    const hasPic = searchParams.get('has_pic');
    const hasLinkedin = searchParams.get('has_linkedin');
    const maxDistance = searchParams.get('max_distance');
    const isMapMode = searchParams.get('map_points') === 'true';
    const rawTid = (await sessionFromRequest(request))?.tid || null;
    const tid = (rawTid && rawTid !== 'tnt_master') ? rawTid : null;
    const sortBy = searchParams.get('sort_by') || 'distance_m';
    const bypassCache = searchParams.get('fresh') === '1' || searchParams.has('_t');
    const cacheTtl = bypassCache ? 0 : 15000;
    const order = (searchParams.get('order') || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 200);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    const conditions = [];
    const args = [];

    if (anchor) {
      if (anchor === 'Prospekta Jakarta Hub') {
        conditions.push("(anchor = 'Prospekta Jakarta Hub' OR anchor = 'Prospekta Hub')");
      } else {
        conditions.push('(anchor = ? OR anchor LIKE ?)');
        args.push(anchor, `%${anchor}%`);
      }
    }

    if (maxDistance && !isNaN(Number(maxDistance)) && reachStatus !== 'replied') {
      conditions.push('distance_m <= ?');
      args.push(Number(maxDistance));
    }

    if (search) {
      const sLower = search.toLowerCase().trim();
      if (sLower === 'balas' || sLower === 'dibalas' || sLower === 'membalas' || sLower === 'replied' || sLower === 'reply') {
        conditions.push("(reach_status = 'replied' OR overture_id IN (SELECT place_id FROM places_status_overlay WHERE reach_status = 'replied'))");
      } else {
        conditions.push('(name LIKE ? OR address LIKE ? OR phone LIKE ? OR email LIKE ? OR pic_name LIKE ?)');
        const pattern = `%${search}%`;
        args.push(pattern, pattern, pattern, pattern, pattern);
      }
    }

    if (bidangUsaha && bidangUsaha !== 'all') {
      conditions.push('bidang_usaha = ?');
      args.push(bidangUsaha);
    }

    if (enrichStatus && enrichStatus !== 'all') {
      conditions.push('enrich_status = ?');
      args.push(enrichStatus);
    }

    if (reachStatus && reachStatus !== 'all') {
      if (reachStatus === 'new') {
        conditions.push("(reach_status = 'new' OR reach_status IS NULL OR reach_status = '')");
      } else {
        // Query overlay place_ids from dbWrite for statuses that are updated dynamically (replied, lost, etc.)
        let overlayIds = [];
        try {
          const overlayFilter = tid
            ? 'WHERE reach_status = ? AND tenant_id = ?'
            : `WHERE reach_status = ? AND (tenant_id IS NULL OR tenant_id = 'tnt_master' OR tenant_id = '')`;
          const overlayArgs = tid ? [reachStatus, tid] : [reachStatus];
          const oRes = await dbWrite.execute({
            sql: `SELECT place_id FROM places_status_overlay ${overlayFilter};`,
            args: overlayArgs,
          });
          overlayIds = (oRes.rows || []).map((r) => r.place_id).filter(Boolean);
        } catch (_) {}

        if (overlayIds.length > 0) {
          const placeholders = overlayIds.map(() => '?').join(',');
          conditions.push(`(reach_status = ? OR overture_id IN (${placeholders}))`);
          args.push(reachStatus, ...overlayIds);
        } else {
          conditions.push('reach_status = ?');
          args.push(reachStatus);
        }
      }
    }

    if (hasPhone === 'true' || hasPhone === '1' || hasWa === 'true' || hasWa === '1') {
      conditions.push("phone IS NOT NULL AND phone != ''");
    } else if (noPhone === 'true' || noPhone === '1') {
      conditions.push("(phone IS NULL OR TRIM(phone) = '')");
    }
 
    if (hasWebsite === 'true' || hasWebsite === '1') {
      conditions.push("website IS NOT NULL AND TRIM(website) != ''");
    }

    if (noWebsite === 'true' || noWebsite === '1') {
      conditions.push("(website IS NULL OR TRIM(website) = '')");
    }

    const websiteCondition = searchParams.get('website_condition');
    if (websiteCondition && websiteCondition !== 'all') {
      if (websiteCondition === 'none') {
        conditions.push("(website IS NULL OR TRIM(website) = '' OR website_condition = 'none')");
      } else if (websiteCondition === 'outdated') {
        conditions.push("website_condition = 'outdated'");
      } else if (websiteCondition === 'modern') {
        conditions.push("website_condition = 'modern'");
      }
    }

 
    if (hasEmail === 'true' || hasEmail === '1') {
      conditions.push("email IS NOT NULL AND email != ''");
    }

    if (hasPic === 'true' || hasPic === '1') {
      conditions.push("pic_name IS NOT NULL AND pic_name != ''");
    }

    if (hasLinkedin === 'true' || hasLinkedin === '1') {
      conditions.push("linkedin_url IS NOT NULL AND linkedin_url != ''");
    }

    const isPersonalLead = searchParams.get('is_personal_lead');
    if (isPersonalLead === 'true' || isPersonalLead === '1') {
      conditions.push("is_personal_lead = 1");
    }

    const fromMasterSheet = searchParams.get('from_master_sheet');
    if (fromMasterSheet === 'true' || fromMasterSheet === '1') {
      conditions.push("(source = 'google_sheets_master' OR problem_analysis IS NOT NULL)");
    }

    const assignedPic = searchParams.get('assigned_pic');
    if (assignedPic && assignedPic !== 'all') {
      conditions.push("assigned_pic = ?");
      args.push(assignedPic);
    }

    const hasPrebuiltSite = searchParams.get('has_prebuilt_site');
    if (hasPrebuiltSite === 'true' || hasPrebuiltSite === '1') {
      conditions.push("has_prebuilt_site = 1");
    }

    const hasSentOutreach = searchParams.get('has_sent_outreach');
    if (hasSentOutreach === 'true' || hasSentOutreach === '1') {
      conditions.push("(reach_status = 'sent' OR outreach_count > 0)");
    }

    if (tid) {
      conditions.push('anchor IN (SELECT name FROM anchors WHERE tenant_id = ?)');
      args.push(tid);
    } else {
      // Admin Prospekta internal melihat wilayah master (tenant_id NULL atau tnt_master), bukan tenant klien
      conditions.push("(anchor IN (SELECT name FROM anchors WHERE tenant_id IS NULL OR tenant_id = 'tnt_master') OR anchor NOT IN (SELECT name FROM anchors WHERE tenant_id IS NOT NULL AND tenant_id != 'tnt_master'))");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Allowed sort columns
    const allowedSorts = ['distance_m', 'name', 'confidence', 'scraped_at', 'icp_score'];
    const safeSortBy = allowedSorts.includes(sortBy) ? sortBy : 'distance_m';

    // Resolusi pengaturan sektor bisnis target kustom tenant untuk scoring ICP dinamis
    let tenantSettings = null;
    if (tid) {
      tenantSettings = await getSettings(tid).catch(() => null);
    }
    const rawTarget = (tenantSettings?.target_categories || '').trim().toLowerCase();
    const targetKeywords = (rawTarget && rawTarget !== 'all')
      ? rawTarget.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s.length >= 2)
      : [];

    let industryCaseSql = '';
    let targetIndustryFlagSql = '0 as is_target_industry';

    const validKeywords = targetKeywords
      .map((k) => k.replace(/[^a-zA-Z0-9_\s-]/g, '').trim())
      .filter((k) => k.length >= 2);

    if (validKeywords.length > 0) {
      const matchClauses = validKeywords
        .map((cleanK) => `LOWER(COALESCE(category_raw, '') || ' ' || COALESCE(bidang_usaha, '') || ' ' || COALESCE(name, '')) LIKE '%${cleanK}%'`)
        .join(' OR ');

      industryCaseSql = `
        CASE 
          WHEN (${matchClauses}) THEN 25
          ELSE 10
        END
      `;
      targetIndustryFlagSql = `
        CASE 
          WHEN (${matchClauses}) THEN 1
          ELSE 0
        END as is_target_industry
      `;
    } else {
      // Default fallback jika memilih 'all' atau belum mengatur: sektor bisnis komersial standar
      industryCaseSql = `
        CASE 
          WHEN LOWER(COALESCE(category_raw, '') || ' ' || COALESCE(bidang_usaha, '')) LIKE '%clinic%'
            OR LOWER(COALESCE(category_raw, '') || ' ' || COALESCE(bidang_usaha, '')) LIKE '%medis%'
            OR LOWER(COALESCE(category_raw, '') || ' ' || COALESCE(bidang_usaha, '')) LIKE '%doctor%'
            OR LOWER(COALESCE(category_raw, '') || ' ' || COALESCE(bidang_usaha, '')) LIKE '%dent%'
            OR LOWER(COALESCE(category_raw, '') || ' ' || COALESCE(bidang_usaha, '')) LIKE '%hospital%'
            OR LOWER(COALESCE(category_raw, '') || ' ' || COALESCE(bidang_usaha, '')) LIKE '%law%'
            OR LOWER(COALESCE(category_raw, '') || ' ' || COALESCE(bidang_usaha, '')) LIKE '%consult%'
            OR LOWER(COALESCE(category_raw, '') || ' ' || COALESCE(bidang_usaha, '')) LIKE '%corporate%'
            OR LOWER(COALESCE(category_raw, '') || ' ' || COALESCE(bidang_usaha, '')) LIKE '%company%'
            OR LOWER(COALESCE(category_raw, '') || ' ' || COALESCE(bidang_usaha, '')) LIKE '%financial%'
            OR LOWER(COALESCE(category_raw, '') || ' ' || COALESCE(bidang_usaha, '')) LIKE '%industrial%'
            OR LOWER(COALESCE(category_raw, '') || ' ' || COALESCE(bidang_usaha, '')) LIKE '%engineering%'
            THEN 25
          ELSE 15
        END
      `;
      targetIndustryFlagSql = '0 as is_target_industry';
    }

    // 2. Map mode: return lightweight point data for high-density canvas rendering (cached in-memory for 60s)
    // Skip heavy 11-column COUNT(*) and global subqueries in map mode because table mode already fetches stats
    if (isMapMode) {
      const mapLimit = Math.min(Math.max(parseInt(searchParams.get('map_limit') || '600', 10), 100), 1500);
      const mapSql = `
        SELECT 
          overture_id,
          name,
          category_raw,
          bidang_usaha,
          address,
          lat,
          lng,
          distance_m,
          phone,
          website,
          email,
          whatsapp,
          pic_name,
          linkedin_url,
          COALESCE(reach_status, 'new') as reach_status,
          ${targetIndustryFlagSql}
        FROM places
        ${whereClause}
        ORDER BY distance_m ASC
        LIMIT ?;
      `;
      const mapRes = await cachedExecute({ sql: mapSql, args: [...args, mapLimit] }, bypassCache ? 0 : 15000);
      let mapPlaces = mapRes.rows || [];
      if (mapPlaces.length > 0) {
        const placeIds = mapPlaces.map((p) => p.overture_id).filter(Boolean);
        const overlayMap = await getStatusOverlayMap(placeIds, tid);
        if (overlayMap.size > 0) {
          mapPlaces = mapPlaces.map((p) => {
            const overlay = overlayMap.get(p.overture_id);
            if (!overlay) return p;
            return {
              ...p,
              reach_status: overlay.reach_status || p.reach_status
            };
          });
        }
      }
      return NextResponse.json({
        success: true,
        places: mapPlaces
      }, {
        headers: {
          'Cache-Control': bypassCache ? 'no-store' : 'private, max-age=10, stale-while-revalidate=20'
        }
      });
    }

    // 1. Get live stats, global totals, and paginated table rows in parallel for maximum speed
    const countSql = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 END) as with_phone,
        COUNT(CASE WHEN website IS NOT NULL AND website != '' THEN 1 END) as with_website,
        COUNT(CASE WHEN email IS NOT NULL AND email != '' THEN 1 END) as with_email,
        COUNT(CASE WHEN whatsapp IS NOT NULL AND whatsapp != '' THEN 1 END) as with_wa,
        COUNT(CASE WHEN pic_name IS NOT NULL AND pic_name != '' THEN 1 END) as with_pic,
        COUNT(CASE WHEN linkedin_url IS NOT NULL AND linkedin_url != '' THEN 1 END) as with_linkedin,
        COUNT(CASE WHEN reach_status = 'analyzed' THEN 1 END) as analyzed_count,
        COUNT(CASE WHEN reach_status = 'proposal_draft' THEN 1 END) as proposal_count,
        COUNT(CASE WHEN reach_status = 'sent' OR outreach_count > 0 THEN 1 END) as sent_count,
        COUNT(CASE WHEN reach_status = 'replied' THEN 1 END) as replied_count,
        COUNT(CASE WHEN reach_status = 'lost' THEN 1 END) as lost_count,
        COUNT(CASE WHEN has_prebuilt_site = 1 THEN 1 END) as prebuilt_count
      FROM places 
      ${whereClause};
    `;
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const threeDaysAgoPrefix = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const tLogFilter = tid ? `tenant_id = ?` : `(tenant_id IS NULL OR tenant_id = 'tnt_master' OR tenant_id = '')`;
    const tOverlayFilter = tid ? `tenant_id = ?` : `(tenant_id IS NULL OR tenant_id = 'tnt_master' OR tenant_id = '')`;
    const tArg = tid ? [tid] : [];

    const globalCountSql = `
      SELECT 
        (SELECT COUNT(*) FROM sg_outreach_logs WHERE place_id IS NOT NULL AND place_id != '' AND ${tLogFilter}) as global_sent,
        (SELECT COUNT(*) FROM prebuilt_websites WHERE ${tLogFilter}) as global_prebuilt,
        (SELECT COUNT(*) FROM sg_outreach_logs WHERE (sent_date = ? OR created_at LIKE ?) AND place_id IS NOT NULL AND place_id != '' AND ${tLogFilter}) as today_sent,
        (SELECT COUNT(*) FROM prebuilt_websites WHERE place_id IN (SELECT place_id FROM sg_outreach_logs WHERE (sent_date = ? OR created_at LIKE ?) AND place_id IS NOT NULL AND place_id != '' AND ${tLogFilter})) as today_prebuilt,
        (SELECT COUNT(*) FROM sg_outreach_logs WHERE COALESCE(followup_count, 0) > 0 AND ${tLogFilter}) as global_followed_up,
        (SELECT COUNT(*) FROM sg_outreach_logs WHERE COALESCE(followup_count, 0) = 0 AND SUBSTR(created_at, 1, 10) <= ? AND ${tLogFilter}) as global_unreplied_eligible,
        (SELECT COUNT(*) FROM places_status_overlay WHERE reach_status = 'replied' AND ${tOverlayFilter}) as global_replied,
        (SELECT COUNT(*) FROM places_status_overlay WHERE reach_status = 'lost' AND ${tOverlayFilter}) as global_lost,
        (SELECT COUNT(*) FROM sg_outreach_logs WHERE status = 'delivered_ooo' AND ${tLogFilter}) as global_ooo;
    `;
    const globalCountArgs = [
      ...tArg,
      ...tArg,
      todayPrefix, `${todayPrefix}%`, ...tArg,
      todayPrefix, `${todayPrefix}%`, ...tArg,
      ...tArg,
      threeDaysAgoPrefix, ...tArg,
      ...tArg,
      ...tArg,
      ...tArg
    ];
    const dataSql = `
      SELECT 
        overture_id,
        anchor,
        name,
        category_raw,
        bidang_usaha,
        address,
        lat,
        lng,
        distance_m,
        phone,
        website,
        email,
        email_source,
        enrich_status,
        confidence,
        source,
        scraped_at,
        pic_name,
        whatsapp,
        linkedin_url,
        pic_linkedin_url,
        phone_secondary,
        all_phones,
        all_emails,
        COALESCE(reach_status, 'new') as reach_status,
        is_personal_lead,
        assigned_pic,
        lead_verified_at,
        budget_capacity,
        budget_notes,
        website_condition,
        social_condition,
        offer_angle,
        pic_title,
        contact_verified,
        key_people,
        problem_analysis,
        social_media,
        COALESCE(problem_analysis, notes, sg_notes) as notes,
        COALESCE(problem_analysis, notes, sg_notes) as sg_notes,
        COALESCE(has_prebuilt_site, 0) as has_prebuilt_site,
        prebuilt_slug,
        prebuilt_created_at,
        last_outreach_at,
        COALESCE(outreach_count, 0) as outreach_count,
        COALESCE(
          (
            CASE WHEN email IS NOT NULL AND email != '' AND email LIKE '%@%' THEN 30 ELSE 0 END +
            CASE WHEN pic_name IS NOT NULL AND pic_name != '' THEN 25 ELSE 0 END +
            CASE WHEN phone IS NOT NULL AND phone != '' THEN 10 ELSE 0 END +
            ${industryCaseSql} +
            CASE 
              WHEN website IS NULL OR website = '' OR LOWER(website) LIKE '%facebook%' OR LOWER(website) LIKE '%instagram%' THEN 20
              ELSE 10
            END
          ),
          50
        ) as icp_score,
        ${targetIndustryFlagSql}
      FROM places
      ${whereClause}
      ORDER BY ${safeSortBy} ${order}
      LIMIT ? OFFSET ?;
    `;
    const dataArgs = [...args, limit, offset];

    const [countRes, globalCountRes, dataRes] = await Promise.all([
      cachedExecute({ sql: countSql, args }, cacheTtl),
      // Query hitungan metrik tenant atau global Prospekta sesuai tLogFilter / tOverlayFilter
      cachedExecute({ sql: globalCountSql, args: globalCountArgs }, cacheTtl),
      cachedExecute({ sql: dataSql, args: dataArgs }, cacheTtl)
    ]);

    const statsRow = countRes.rows[0] || {};
    const total = Number(statsRow.total || 0);
    const globalRow = globalCountRes.rows[0] || {};
    // Isolasi metrik per tenant: jika akun klien (tid), gunakan metrik tenant sendiri tanpa fallback ke sent_count tempat master
    const globalSent = tid ? Number(globalRow.global_sent ?? 0) : Number(globalRow.global_sent ?? statsRow.sent_count ?? 0);
    const globalPrebuilt = tid ? Number(globalRow.global_prebuilt ?? 0) : Number(globalRow.global_prebuilt ?? statsRow.prebuilt_count ?? 0);
    const todaySent = Number(globalRow.today_sent || 0);
    const todayPrebuilt = Number(globalRow.today_prebuilt || 0);
    const globalFollowedUp = Number(globalRow.global_followed_up || 0);
    const globalUnrepliedEligible = Number(globalRow.global_unreplied_eligible || 0);

    // Merge status overlay dari dbWrite (Dual-DB synchronization)
    let finalPlaces = dataRes.rows || [];
    if (finalPlaces.length > 0) {
      const placeIds = finalPlaces.map((p) => p.overture_id).filter(Boolean);
      const overlayMap = await getStatusOverlayMap(placeIds, tid);
      if (overlayMap.size > 0) {
        finalPlaces = finalPlaces.map((p) => {
          const overlay = overlayMap.get(p.overture_id);
          if (!overlay) return p;
          return {
            ...p,
            reach_status: overlay.reach_status || p.reach_status,
            notes: overlay.notes || p.notes,
            sg_notes: overlay.sg_notes || overlay.notes || p.sg_notes,
            assigned_pic: overlay.assigned_pic || p.assigned_pic,
            pic_name: overlay.pic_name || p.pic_name,
            pic_title: overlay.pic_title || p.pic_title,
            is_personal_lead: overlay.is_personal_lead !== undefined ? overlay.is_personal_lead : p.is_personal_lead,
            budget_capacity: overlay.budget_capacity || p.budget_capacity,
            website_condition: overlay.website_condition || p.website_condition,
            social_condition: overlay.social_condition || p.social_condition,
            offer_angle: overlay.offer_angle || p.offer_angle,
            has_prebuilt_site: overlay.has_prebuilt_site !== undefined && overlay.has_prebuilt_site !== null ? Number(overlay.has_prebuilt_site) : p.has_prebuilt_site,
            prebuilt_slug: overlay.prebuilt_slug || p.prebuilt_slug,
            last_outreach_at: overlay.last_outreach_at || p.last_outreach_at,
            contact_verified: overlay.contact_verified !== undefined && overlay.contact_verified !== null ? Number(overlay.contact_verified) : p.contact_verified
          };
        });
      }
    }

    return NextResponse.json({
      success: true,
      total,
      stats: {
        total,
        with_phone: Number(statsRow.with_phone || 0),
        with_website: Number(statsRow.with_website || 0),
        with_email: Number(statsRow.with_email || 0),
        with_wa: Number(statsRow.with_wa || 0),
        with_pic: Number(statsRow.with_pic || 0),
        with_linkedin: Number(statsRow.with_linkedin || 0),
        analyzed_count: Number(statsRow.analyzed_count || 0),
        proposal_count: Number(statsRow.proposal_count || 0),
        sent_count: Number(statsRow.sent_count || 0),
        replied_count: Number(globalRow.global_replied ?? statsRow.replied_count ?? 0),
        lost_count: Number(globalRow.global_lost ?? statsRow.lost_count ?? 0),
        prebuilt_count: Number(statsRow.prebuilt_count || 0),
        global_sent_count: globalSent,
        global_prebuilt_count: globalPrebuilt,
        today_sent_count: todaySent,
        today_prebuilt_count: todayPrebuilt,
        followed_up_count: globalFollowedUp,
        unreplied_count: globalUnrepliedEligible,
        global_ooo_count: Number(globalRow.global_ooo || 0),
        deliverability_score: Math.min(100, Math.round(((Number(globalRow.global_replied || 0) + Number(globalRow.global_ooo || 0)) / Math.max(globalSent, 1)) * 1000) / 10),
        pcpl: Math.round(globalSent / Math.max(Number(globalRow.global_replied || 0), 1))
      },
      limit,
      offset,
      places: finalPlaces
    }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' }
    });
  } catch (error) {
    console.error('Error fetching places:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      overture_id,
      name,
      anchor = 'Prospekta Jakarta Hub',
      bidang_usaha,
      category_raw,
      address,
      phone,
      whatsapp,
      email,
      website,
      social_media,
      pic_name,
      pic_title,
      assigned_pic,
      problem_analysis,
      offer_angle = 'agentic_ai',
      budget_capacity = 'medium',
      website_condition,
      social_condition,
      lat = 1.3385,
      lng = 103.7559
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: 'Nama perusahaan / bisnis wajib diisi.' }, { status: 400 });
    }

    const cleanName = name.trim();
    const session = await sessionFromRequest(request);
    let resolvedAnchor = anchor;
    if ((!resolvedAnchor || resolvedAnchor === 'Prospekta Jakarta Hub') && session?.tid) {
      const aRes = await db.execute({ sql: `SELECT name FROM anchors WHERE tenant_id = ? LIMIT 1;`, args: [session.tid] });
      if (aRes.rows?.[0]?.name) {
        resolvedAnchor = aRes.rows[0].name;
      }
    }
    const finalAnchor = resolvedAnchor || (session?.tid ? 'Testing' : 'Prospekta Jakarta Hub');
    const finalCategory = category_raw || bidang_usaha || 'commercial';
    const finalBidang = bidang_usaha || 'Bisnis Komersial';
    const nowIso = new Date().toISOString();

    let existingId = overture_id;
    if (existingId) {
      const checkExists = await dbWrite.execute({
        sql: `SELECT overture_id FROM places WHERE overture_id = ? LIMIT 1;`,
        args: [existingId]
      });
      if (!checkExists.rows || checkExists.rows.length === 0) {
        existingId = null;
      }
    }
    if (!existingId) {
      const checkRes = await dbWrite.execute({
        sql: `SELECT overture_id FROM places WHERE name = ? AND anchor = ? LIMIT 1;`,
        args: [cleanName, finalAnchor]
      });
      if (checkRes.rows && checkRes.rows.length > 0) {
        existingId = checkRes.rows[0].overture_id;
      }
    }

    const allEmails = email ? JSON.stringify([email.trim()]) : null;

    if (existingId) {
      await dbWrite.execute({
        sql: `
          UPDATE places SET
            name = ?,
            bidang_usaha = COALESCE(?, bidang_usaha),
            category_raw = COALESCE(?, category_raw),
            address = COALESCE(?, address),
            phone = COALESCE(?, phone),
            whatsapp = COALESCE(?, whatsapp),
            email = COALESCE(?, email),
            all_emails = COALESCE(?, all_emails),
            website = COALESCE(?, website),
            social_media = COALESCE(?, social_media),
            pic_name = COALESCE(?, pic_name),
            pic_title = COALESCE(?, pic_title),
            assigned_pic = COALESCE(?, assigned_pic),
            problem_analysis = COALESCE(?, problem_analysis),
            sg_notes = COALESCE(?, sg_notes),
            offer_angle = COALESCE(?, offer_angle),
            budget_capacity = COALESCE(?, budget_capacity),
            website_condition = COALESCE(?, website_condition),
            social_condition = COALESCE(?, social_condition),
            is_personal_lead = 1,
            lead_verified_at = ?
          WHERE overture_id = ?;
        `,
        args: [
          cleanName,
          finalBidang,
          finalCategory,
          address || null,
          phone || null,
          whatsapp || null,
          email || null,
          allEmails,
          website || null,
          social_media || null,
          pic_name || null,
          pic_title || null,
          assigned_pic || null,
          problem_analysis || null,
          problem_analysis || null,
          offer_angle || null,
          budget_capacity || null,
          website_condition || null,
          social_condition || null,
          nowIso,
          existingId
        ]
      });

      invalidateCache();

      return NextResponse.json({
        success: true,
        overture_id: existingId,
        message: `Data prospek "${cleanName}" berhasil diperbarui di database & pipeline!`
      });
    } else {
      const newId = `sg_manual_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      await dbWrite.execute({
        sql: `
          INSERT INTO places (
            overture_id, anchor, name, category_raw, bidang_usaha,
            address, lat, lng, distance_m, phone, whatsapp, email,
            all_emails, website, social_media, problem_analysis, sg_notes,
            pic_name, pic_title, assigned_pic, is_personal_lead, reach_status,
            enrich_status, confidence, source, offer_angle, budget_capacity,
            website_condition, social_condition, lead_verified_at, scraped_at
          ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?
          );
        `,
        args: [
          newId,
          finalAnchor,
          cleanName,
          finalCategory,
          finalBidang,
          address || 'Singapore',
          parseFloat(lat) || 1.3385,
          parseFloat(lng) || 103.7559,
          0,
          phone || null,
          whatsapp || null,
          email || null,
          allEmails,
          website || null,
          social_media || null,
          problem_analysis || null,
          problem_analysis || null,
          pic_name || null,
          pic_title || null,
          assigned_pic || 'Prospekta Team',
          1,
          'new',
          'done',
          1.0,
          'manual_input',
          offer_angle,
          budget_capacity,
          website_condition || 'unverified',
          social_condition || 'unverified',
          nowIso,
          nowIso
        ]
      });

      invalidateCache();

      return NextResponse.json({
        success: true,
        overture_id: newId,
        message: `Prospek baru "${cleanName}" berhasil ditambahkan ke database & pipeline!`
      });
    }
  } catch (err) {
    console.error('Failed to create/update place:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}


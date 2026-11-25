import { Type } from '@google/genai';
import { db, dbWrite, getStatusOverlayMap } from './db.js';
import { getCompanyProfile } from './company-agent.js';
import { generateProposalDraft, generatePrebuiltSiteConfig } from './llm.js';
import { sendEmail } from './email.js';
import { getSettings } from './tenant.js';
import { haversineDistance } from './geo.js';

/**
 * Definisi tunggal seluruh Function Calling tools untuk Gemini, OpenAI, dan Claude.
 */
export const AI_TOOLS_SPEC = [
  {
    name: 'list_user_anchors',
    statusLabel: 'Memeriksa daftar area / titik lokasi Anda...',
    description: 'Menampilkan daftar titik lokasi (anchor) dan radius default milik akun Anda.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'search_prospects',
    statusLabel: 'Sedang mencari prospek bisnis...',
    description: 'Cari dan filter prospek bisnis di database milik akun Anda berdasarkan kata kunci, area/anchor, radius km, bidang usaha, status outreach, telepon, email, atau website.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Kata kunci nama bisnis, alamat, atau PIC (opsional)' },
        anchor: { type: 'string', description: 'Nama titik/area anchor (opsional, default mengikuti area aktif di dashboard)' },
        radius_km: { type: 'number', description: 'Filter radius maksimal dalam km dari titik anchor (misal 1, 2, 5, 10)' },
        bidang_usaha: { type: 'string', description: 'Filter kategori/bidang usaha (opsional)' },
        reach_status: { type: 'string', enum: ['all', 'new', 'analyzed', 'proposal_draft', 'sent', 'replied', 'meeting'], description: 'Filter status prospek (opsional)' },
        has_phone: { type: 'boolean', description: 'Hanya prospek yang punya nomor telepon/WA' },
        has_email: { type: 'boolean', description: 'Hanya prospek yang punya alamat email' },
        no_website: { type: 'boolean', description: 'Hanya prospek yang belum punya website' },
        sort_by: { type: 'string', enum: ['distance_m', 'icp_score'], description: 'Urutkan hasil berdasarkan jarak atau skor ICP' },
        limit: { type: 'integer', description: 'Jumlah hasil maksimal (default 15, maksimal 50)' },
      },
    },
  },
  {
    name: 'get_prospect_detail',
    statusLabel: 'Mengambil detail kontak & profil prospek...',
    description: 'Mengambil detail profil lengkap, kontak (telepon, email, PIC, website), hasil analisis AI, proposal, dan link website preview untuk sebuah prospek.',
    parameters: {
      type: 'object',
      properties: {
        placeId: { type: 'string', description: 'ID tempat (overture_id) prospek milik Anda' },
      },
      required: ['placeId'],
    },
  },
  {
    name: 'generate_proposal_pdf',
    statusLabel: 'Membuat draf proposal PDF...',
    description: 'Membuat draf proposal kemitraan bisnis resmi siap cetak/unduh PDF untuk prospek milik akun Anda dan menyimpannya ke arsip.',
    parameters: {
      type: 'object',
      properties: {
        placeId: { type: 'string', description: 'ID tempat (overture_id) prospek yang akan dibuatkan proposal' },
        title: { type: 'string', description: 'Judul khusus proposal (opsional)' },
        lang: { type: 'string', enum: ['id', 'en'], description: 'Bahasa proposal (default: id)' },
      },
      required: ['placeId'],
    },
  },
  {
    name: 'list_my_proposals',
    statusLabel: 'Membaca arsip proposal PDF Anda...',
    description: 'Melihat daftar arsip dokumen proposal PDF yang telah dibuat oleh akun Anda.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Jumlah dokumen maksimal (default: 15)' },
      },
    },
  },
  {
    name: 'generate_website_preview',
    statusLabel: 'Membuat prototype website preview...',
    description: 'Membuat live prototype website modern (/p/[slug]) untuk prospek bisnis milik akun Anda.',
    parameters: {
      type: 'object',
      properties: {
        placeId: { type: 'string', description: 'ID tempat (overture_id) bisnis' },
      },
      required: ['placeId'],
    },
  },
  {
    name: 'list_my_websites',
    statusLabel: 'Membaca daftar website preview Anda...',
    description: 'Melihat daftar live prototype website (/p/[slug]) yang telah dibuat untuk akun Anda.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Jumlah website maksimal (default: 15)' },
      },
    },
  },
  {
    name: 'get_company_knowledge',
    statusLabel: 'Mengambil profil layanan & knowledge base...',
    description: 'Membaca profil layanan perusahaan dan knowledge base Prospekta untuk menyusun penawaran yang relevan.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'create_email_draft',
    statusLabel: 'Menyusun draf email penawaran...',
    description: 'Menyiapkan konteks & struktur draf email cold outreach ringkas (< 60 kata) untuk prospek tertentu.',
    parameters: {
      type: 'object',
      properties: {
        placeId: { type: 'string', description: 'ID tempat (overture_id) prospek' },
        purpose: { type: 'string', description: 'Tujuan penawaran (opsional)' },
      },
      required: ['placeId'],
    },
  },
  {
    name: 'send_email_outreach',
    statusLabel: 'Mengirim email melalui konektor aktif...',
    description: 'Mengirim email melalui Konektor Email (Mode Cepat Reply-To atau SMTP Mandiri) yang sudah Anda hubungkan. Hanya panggil jika pengguna meminta pengiriman secara eksplisit.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Alamat email penerima' },
        subject: { type: 'string', description: 'Subjek email' },
        body: { type: 'string', description: 'Isi pesan teks email' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'admin_workspace_overview',
    adminOnly: true,
    statusLabel: 'Mengambil ringkasan workspace admin...',
    description: 'Khusus Admin: melihat ringkasan pengguna aktif dan statistik operasional workspace.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Batas baris daftar user/audit (default 20)' },
      },
    },
  },
];

export function getToolsForSession(session) {
  const isAdmin = session?.role === 'admin';
  return AI_TOOLS_SPEC.filter((t) => !t.adminOnly || isAdmin);
}

const JSON_TYPE_MAP = {
  string: Type.STRING,
  number: Type.NUMBER,
  integer: Type.INTEGER,
  boolean: Type.BOOLEAN,
  array: Type.ARRAY,
  object: Type.OBJECT,
};

function convertSchemaToGemini(schema = { type: 'object', properties: {} }) {
  const out = {
    type: JSON_TYPE_MAP[schema.type] || Type.OBJECT,
  };
  if (schema.description) out.description = schema.description;
  if (Array.isArray(schema.enum)) out.enum = schema.enum;
  if (Array.isArray(schema.required) && schema.required.length > 0) out.required = schema.required;
  if (schema.properties && typeof schema.properties === 'object') {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([k, v]) => [k, convertSchemaToGemini(v)])
    );
  }
  if (schema.items) out.items = convertSchemaToGemini(schema.items);
  return out;
}

export function toGeminiFunctionDeclarations(tools) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: convertSchemaToGemini(t.parameters),
  }));
}

export function toOpenAiTools(tools) {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export function toClaudeTools(tools) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

export function getToolStatusLabel(toolName) {
  const found = AI_TOOLS_SPEC.find((t) => t.name === toolName);
  return found?.statusLabel || `Menjalankan ${toolName}...`;
}

/**
 * Resolusi batas akses data mutlak dari session server (bukan argumen LLM).
 */
function resolveSessionScope(session) {
  const userId = session?.uid;
  if (!userId) {
    throw Object.assign(new Error('Sesi pengguna tidak valid.'), { status: 401 });
  }
  const isAdmin = session?.role === 'admin';
  const rawTid = session?.tid || null;
  const effectiveTid = isAdmin ? (rawTid || 'tnt_master') : rawTid;
  return { userId, isAdmin, tid: rawTid, effectiveTid };
}

function buildPlaceScopeClause(scope, tableAlias = 'p') {
  const col = (name) => (tableAlias ? `${tableAlias}.${name}` : name);
  if (scope.isAdmin) {
    return {
      sql: `(${col('owner_user_id')} = ? OR ${col('tenant_id')} IS NULL OR ${col('tenant_id')} = 'tnt_master' OR ${col('tenant_id')} = '' OR ${col('anchor')} IN (SELECT name FROM anchors WHERE tenant_id IS NULL OR tenant_id = 'tnt_master'))`,
      args: [scope.userId],
    };
  }
  if (scope.tid && scope.tid !== 'tnt_master') {
    return {
      sql: `(${col('owner_user_id')} = ? OR ((${col('owner_user_id')} IS NULL OR ${col('owner_user_id')} = '') AND (${col('tenant_id')} = ? OR ${col('anchor')} IN (SELECT name FROM anchors WHERE tenant_id = ?))))`,
      args: [scope.userId, scope.tid, scope.tid],
    };
  }
  return {
    sql: `${col('owner_user_id')} = ?`,
    args: [scope.userId],
  };
}

function buildAnchorScopeClause(scope) {
  if (scope.isAdmin) {
    return {
      sql: `(tenant_id IS NULL OR tenant_id = 'tnt_master' OR owner_user_id = ?)`,
      args: [scope.userId],
    };
  }
  if (scope.tid && scope.tid !== 'tnt_master') {
    return {
      sql: `(owner_user_id = ? OR ((owner_user_id IS NULL OR owner_user_id = '') AND tenant_id = ?))`,
      args: [scope.userId, scope.tid],
    };
  }
  return { sql: `owner_user_id = ?`, args: [scope.userId] };
}

async function fetchScopedPlace(placeId, scope) {
  const cleanId = String(placeId || '').trim();
  if (!cleanId) throw new Error('placeId wajib diisi.');
  const { sql: scopeSql, args: scopeArgs } = buildPlaceScopeClause(scope, 'p');
  const res = await db.execute({
    sql: `SELECT p.* FROM places p WHERE p.overture_id = ? AND (${scopeSql}) LIMIT 1;`,
    args: [cleanId, ...scopeArgs],
  });
  const place = res.rows?.[0];
  if (!place) {
    throw new Error(`Prospek "${cleanId}" tidak ditemukan dalam data akun Anda.`);
  }
  return place;
}

/**
 * Eksekutor tool terisolasi per user_id / tenant_id dari server session.
 */
export async function executeAiTool(toolName, args = {}, session, uiContext = {}) {
  const scope = resolveSessionScope(session);

  switch (toolName) {
    case 'list_user_anchors': {
      const { sql: aSql, args: aArgs } = buildAnchorScopeClause(scope);
      const res = await dbWrite.execute({
        sql: `SELECT id, name, address, city, lat, lng, radius_default_km FROM anchors WHERE ${aSql} ORDER BY id ASC;`,
        args: aArgs,
      });
      return {
        activeAreaHint: uiContext?.activeAnchor?.name || null,
        activeRadiusKmHint: uiContext?.radiusKm || null,
        count: res.rows?.length || 0,
        anchors: res.rows || [],
      };
    }

    case 'search_prospects': {
      const lim = Math.min(Math.max(Number(args.limit) || 15, 1), 50);
      const { sql: scopeSql, args: scopeArgs } = buildPlaceScopeClause(scope, 'p');
      const conds = [scopeSql];
      const qArgs = [...scopeArgs];

      // Resolusi anchor & koordinat bila user atau dashboard memilih area
      const requestedAnchor = (args.anchor || uiContext?.activeAnchor?.name || '').trim();
      let anchorCoords = null;
      if (requestedAnchor && requestedAnchor.toLowerCase() !== 'all' && requestedAnchor.toLowerCase() !== 'semua') {
        const { sql: aSql, args: aArgs } = buildAnchorScopeClause(scope);
        const aRes = await dbWrite.execute({
          sql: `SELECT name, lat, lng, radius_default_km FROM anchors WHERE (${aSql}) AND (LOWER(name) = LOWER(?) OR LOWER(name) LIKE LOWER(?)) LIMIT 1;`,
          args: [...aArgs, requestedAnchor, `%${requestedAnchor}%`],
        });
        const anchorRow = aRes.rows?.[0];
        if (anchorRow) {
          anchorCoords = { name: anchorRow.name, lat: Number(anchorRow.lat), lng: Number(anchorRow.lng) };
          conds.push(`(p.anchor = ? OR p.anchor LIKE ?)`);
          qArgs.push(anchorRow.name, `%${anchorRow.name}%`);
        } else {
          conds.push(`(p.anchor LIKE ? OR p.address LIKE ?)`);
          qArgs.push(`%${requestedAnchor}%`, `%${requestedAnchor}%`);
        }
      }

      const radiusKm = Number(args.radius_km || (anchorCoords ? uiContext?.radiusKm : 0) || 0);
      if (radiusKm > 0 && !anchorCoords) {
        conds.push(`p.distance_m <= ?`);
        qArgs.push(Math.round(radiusKm * 1000));
      }

      if (args.query && String(args.query).trim()) {
        const pat = `%${String(args.query).trim()}%`;
        conds.push(`(p.name LIKE ? OR p.address LIKE ? OR p.bidang_usaha LIKE ? OR p.pic_name LIKE ?)`);
        qArgs.push(pat, pat, pat, pat);
      }

      if (args.bidang_usaha && String(args.bidang_usaha).trim() && args.bidang_usaha !== 'all') {
        conds.push(`p.bidang_usaha LIKE ?`);
        qArgs.push(`%${String(args.bidang_usaha).trim()}%`);
      }

      if (args.has_phone) conds.push(`p.phone IS NOT NULL AND TRIM(p.phone) != ''`);
      if (args.has_email) conds.push(`p.email IS NOT NULL AND TRIM(p.email) != ''`);
      if (args.no_website) conds.push(`(p.website IS NULL OR TRIM(p.website) = '')`);

      const sortCol = args.sort_by === 'icp_score' ? 'COALESCE(p.icp_score, 0) DESC, p.distance_m ASC' : 'p.distance_m ASC';
      const fetchLimit = radiusKm > 0 && anchorCoords ? Math.max(lim * 4, 100) : Math.max(lim * 2, 40);

      const res = await db.execute({
        sql: `SELECT p.overture_id, p.anchor, p.name, p.bidang_usaha, p.address, p.lat, p.lng, p.distance_m,
                     p.phone, p.whatsapp, p.email, p.website, p.pic_name, p.pic_title,
                     p.reach_status, p.icp_score, p.has_prebuilt_site, p.prebuilt_slug, p.website_condition
              FROM places p
              WHERE ${conds.join(' AND ')}
              ORDER BY ${sortCol}
              LIMIT ?;`,
        args: [...qArgs, fetchLimit],
      });

      let rows = res.rows || [];
      const overlayMap = await getStatusOverlayMap(rows.map((r) => r.overture_id), scope.effectiveTid);

      rows = rows.map((r) => {
        const ov = overlayMap.get(r.overture_id);
        const distM = anchorCoords && r.lat != null && r.lng != null
          ? haversineDistance(anchorCoords.lat, anchorCoords.lng, Number(r.lat), Number(r.lng))
          : Number(r.distance_m || 0);
        return {
          overture_id: r.overture_id,
          anchor: r.anchor,
          name: r.name,
          bidang_usaha: r.bidang_usaha || '',
          address: r.address || '',
          distance_m: distM,
          phone: r.phone || r.whatsapp || '',
          email: r.email || '',
          website: r.website || '',
          pic_name: ov?.pic_name || r.pic_name || '',
          icp_score: Number(r.icp_score || 0),
          reach_status: ov?.reach_status || r.reach_status || 'new',
          prebuilt_url: (ov?.prebuilt_slug || r.prebuilt_slug) ? `/p/${ov?.prebuilt_slug || r.prebuilt_slug}` : null,
        };
      });

      if (radiusKm > 0) {
        const maxMeters = radiusKm * 1000;
        rows = rows.filter((r) => r.distance_m <= maxMeters);
      }

      if (args.reach_status && args.reach_status !== 'all') {
        rows = rows.filter((r) => r.reach_status === args.reach_status);
      }

      const finalRows = rows.slice(0, lim);
      return {
        areaUsed: anchorCoords?.name || requestedAnchor || 'Semua Area Akun',
        radiusKmUsed: radiusKm || null,
        totalMatched: rows.length,
        count: finalRows.length,
        prospects: finalRows,
      };
    }

    case 'get_prospect_detail': {
      const place = await fetchScopedPlace(args.placeId, scope);
      const overlayMap = await getStatusOverlayMap([place.overture_id], scope.effectiveTid);
      const ov = overlayMap.get(place.overture_id);

      const [analysisRes, proposalRes, siteRes] = await Promise.all([
        db.execute({
          sql: `SELECT summary, products, needs, source_url, created_at FROM analyses WHERE place_id = ? ORDER BY created_at DESC LIMIT 1;`,
          args: [place.overture_id],
        }).catch(() => ({ rows: [] })),
        dbWrite.execute({
          sql: `SELECT id, title, status, updated_at FROM proposals WHERE place_id = ? AND tenant_id = ? ORDER BY updated_at DESC LIMIT 1;`,
          args: [place.overture_id, scope.effectiveTid || 'tnt_master'],
        }).catch(() => ({ rows: [] })),
        dbWrite.execute({
          sql: `SELECT slug, status, views_count FROM prebuilt_websites WHERE place_id = ? LIMIT 1;`,
          args: [place.overture_id],
        }).catch(() => ({ rows: [] })),
      ]);

      return {
        overture_id: place.overture_id,
        name: place.name,
        bidang_usaha: place.bidang_usaha || place.category_raw || '',
        address: place.address || '',
        anchor: place.anchor,
        distance_m: place.distance_m,
        phone: place.phone || '',
        whatsapp: place.whatsapp || '',
        email: place.email || '',
        website: place.website || '',
        pic_name: ov?.pic_name || place.pic_name || '',
        pic_title: ov?.pic_title || place.pic_title || '',
        reach_status: ov?.reach_status || place.reach_status || 'new',
        icp_score: place.icp_score || 0,
        latestAnalysis: analysisRes.rows?.[0] || null,
        latestProposal: proposalRes.rows?.[0] || null,
        prebuiltWebsite: siteRes.rows?.[0]
          ? { ...siteRes.rows[0], previewUrl: `/p/${siteRes.rows[0].slug}` }
          : null,
      };
    }

    case 'generate_proposal_pdf': {
      const place = await fetchScopedPlace(args.placeId, scope);
      const analysisRes = await db.execute({
        sql: `SELECT * FROM analyses WHERE place_id = ? ORDER BY created_at DESC LIMIT 1;`,
        args: [place.overture_id],
      }).catch(() => ({ rows: [] }));

      const rawAnalysis = analysisRes.rows?.[0] || {};
      const parsedAnalysis = { ...rawAnalysis };
      for (const field of ['needs', 'use_cases', 'unknowns']) {
        if (typeof rawAnalysis[field] === 'string') {
          try { parsedAnalysis[field] = JSON.parse(rawAnalysis[field]); } catch (_) {}
        }
      }

      const lang = args.lang === 'en' ? 'en' : 'id';
      const proposalMarkdown = await generateProposalDraft({
        companyName: place.name,
        category: place.bidang_usaha || place.category_raw || '',
        analysis: parsedAnalysis,
        place,
        lang,
        tenantId: scope.effectiveTid,
      });

      const docId = `pdf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const propId = `prop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const nowIso = new Date().toISOString();
      const title = (args.title || '').trim() || `Proposal Kemitraan Digital - ${place.name}`;

      await dbWrite.batch([
        {
          sql: `INSERT INTO pdf_documents (id, user_id, place_id, title, storage_key, public_url, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?);`,
          args: [docId, scope.userId, place.overture_id, title, `proposals/${docId}.md`, null, nowIso],
        },
        {
          sql: `INSERT INTO proposals (id, place_id, analysis_id, title, content, status, version, created_at, updated_at, tenant_id)
                VALUES (?, ?, ?, ?, ?, 'draft', 1, ?, ?, ?);`,
          args: [propId, place.overture_id, rawAnalysis.id || null, title, proposalMarkdown, nowIso, nowIso, scope.effectiveTid || 'tnt_master'],
        },
        {
          sql: `INSERT INTO places_status_overlay (place_id, reach_status, updated_at, tenant_id)
                VALUES (?, 'proposal_draft', ?, ?)
                ON CONFLICT(place_id) DO UPDATE SET
                  reach_status = CASE WHEN places_status_overlay.reach_status = 'new' OR places_status_overlay.reach_status IS NULL THEN 'proposal_draft' ELSE places_status_overlay.reach_status END,
                  updated_at = excluded.updated_at;`,
          args: [place.overture_id, nowIso, scope.effectiveTid || 'tnt_master'],
        },
      ], 'write');

      return {
        success: true,
        documentId: docId,
        proposalId: propId,
        placeId: place.overture_id,
        placeName: place.name,
        title,
        contentMarkdown: proposalMarkdown,
        downloadHint: 'Klik nama perusahaan di tabel prospek untuk membuka/mengunduh PDF resmi, atau salin draf proposal di bawah.',
      };
    }

    case 'list_my_proposals': {
      const lim = Math.min(Math.max(Number(args.limit) || 15, 1), 50);
      const res = await dbWrite.execute({
        sql: `SELECT d.id, d.place_id, d.title, d.created_at, p.name as place_name
              FROM pdf_documents d
              LEFT JOIN places p ON p.overture_id = d.place_id
              WHERE d.user_id = ?
              ORDER BY d.created_at DESC
              LIMIT ?;`,
        args: [scope.userId, lim],
      });
      return { count: res.rows?.length || 0, documents: res.rows || [] };
    }

    case 'generate_website_preview': {
      const place = await fetchScopedPlace(args.placeId, scope);
      const existing = await dbWrite.execute({
        sql: `SELECT slug, company_name, tenant_id, owner_user_id FROM prebuilt_websites WHERE place_id = ? LIMIT 1;`,
        args: [place.overture_id],
      });
      const existingSite = existing.rows?.[0];
      if (existingSite?.slug && (scope.isAdmin || existingSite.owner_user_id === scope.userId || existingSite.tenant_id === scope.effectiveTid)) {
        return {
          success: true,
          slug: existingSite.slug,
          previewUrl: `/p/${existingSite.slug}`,
          companyName: existingSite.company_name || place.name,
          status: 'already_exists',
        };
      }

      const slugBase = place.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'biz';
      const slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
      const nowIso = new Date().toISOString();
      const category = place.bidang_usaha || place.category_raw || 'Commercial Services';

      const siteConfig = await generatePrebuiltSiteConfig({
        name: place.name,
        category,
        address: place.address || '',
        phone: place.phone || place.whatsapp || '',
        website: place.website || '',
        rating: Number(place.google_rating || 4.8),
        reviewsCount: Number(place.reviews_count || 14),
        lang: 'id',
        tenantId: scope.effectiveTid,
      });

      await dbWrite.batch([
        {
          sql: `INSERT INTO prebuilt_websites (
                  place_id, slug, company_name, category, industry, phone, email,
                  google_rating, reviews_count, hero_headline, hero_subheadline, services_json,
                  status, created_at, updated_at, tenant_id, owner_user_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)
                ON CONFLICT(place_id) DO UPDATE SET
                  slug = excluded.slug,
                  services_json = excluded.services_json,
                  hero_headline = excluded.hero_headline,
                  hero_subheadline = excluded.hero_subheadline,
                  updated_at = excluded.updated_at,
                  tenant_id = excluded.tenant_id,
                  owner_user_id = excluded.owner_user_id;`,
          args: [
            place.overture_id,
            slug,
            place.name,
            category,
            category,
            place.phone || place.whatsapp || '',
            place.email || '',
            Number(place.google_rating || 4.8),
            Number(place.reviews_count || 14),
            siteConfig.heroHeadline || `Transformasi Digital ${place.name}`,
            siteConfig.heroSubheadline || 'Prototype Website Profesional',
            JSON.stringify(siteConfig),
            nowIso,
            nowIso,
            scope.effectiveTid || 'tnt_master',
            scope.userId,
          ],
        },
        {
          sql: `INSERT INTO places_status_overlay (place_id, has_prebuilt_site, prebuilt_slug, prebuilt_created_at, reach_status, updated_at, tenant_id)
                VALUES (?, 1, ?, ?, 'proposal_draft', ?, ?)
                ON CONFLICT(place_id) DO UPDATE SET
                  has_prebuilt_site = 1,
                  prebuilt_slug = excluded.prebuilt_slug,
                  prebuilt_created_at = excluded.prebuilt_created_at,
                  updated_at = excluded.updated_at;`,
          args: [place.overture_id, slug, nowIso, nowIso, scope.effectiveTid || 'tnt_master'],
        },
      ], 'write');

      return {
        success: true,
        slug,
        previewUrl: `/p/${slug}`,
        companyName: place.name,
        status: 'created',
      };
    }

    case 'list_my_websites': {
      const lim = Math.min(Math.max(Number(args.limit) || 15, 1), 50);
      const where = scope.isAdmin
        ? `(owner_user_id = ? OR tenant_id IS NULL OR tenant_id = 'tnt_master' OR tenant_id = '')`
        : `(owner_user_id = ? OR (owner_user_id IS NULL AND tenant_id = ?))`;
      const qArgs = scope.isAdmin ? [scope.userId, lim] : [scope.userId, scope.effectiveTid || '', lim];
      const res = await dbWrite.execute({
        sql: `SELECT id, place_id, slug, company_name, views_count, created_at
              FROM prebuilt_websites
              WHERE ${where}
              ORDER BY created_at DESC
              LIMIT ?;`,
        args: qArgs,
      });
      return {
        count: res.rows?.length || 0,
        websites: (res.rows || []).map((w) => ({ ...w, previewUrl: `/p/${w.slug}` })),
      };
    }

    case 'get_company_knowledge': {
      const [profile, settings] = await Promise.all([
        getCompanyProfile().catch(() => null),
        scope.effectiveTid ? getSettings(scope.effectiveTid).catch(() => null) : Promise.resolve(null),
      ]);
      return {
        companyName: settings?.company_name || profile?.companyName || 'Prospekta',
        offering: settings?.company_offering || profile?.knowledgeMarkdown || '',
        targetAudience: settings?.target_audience || '',
        calendlyUrl: settings?.calendly_url || process.env.NEXT_PUBLIC_CALENDAR_URL || '',
        emailConnectorMode: settings?.email_provider_mode || 'smtp',
        emailConnectorAccount: settings?.gmail_mcp_account || settings?.smtp_from || settings?.smtp_user || '',
      };
    }

    case 'create_email_draft': {
      const place = await fetchScopedPlace(args.placeId, scope);
      const settings = scope.effectiveTid ? await getSettings(scope.effectiveTid).catch(() => null) : null;
      return {
        placeId: place.overture_id,
        companyName: place.name,
        recipientEmail: place.email || '',
        picName: place.pic_name || '',
        website: place.website || '',
        purpose: args.purpose || 'Perkenalan kolaborasi digital & website preview',
        senderIdentity: settings?.gmail_mcp_account || settings?.smtp_from || settings?.smtp_user || '',
        offeringContext: settings?.company_offering || 'Solusi digitalisasi, pembuatan website bisnis modern, dan otomasi B2B.',
        calendarLink: settings?.calendly_url || process.env.NEXT_PUBLIC_CALENDAR_URL || '',
      };
    }

    case 'send_email_outreach': {
      const to = String(args.to || '').trim();
      const subject = String(args.subject || '').trim();
      const bodyText = String(args.body || '').trim();
      if (!to || !to.includes('@')) throw new Error('Alamat email penerima tidak valid.');
      if (!subject || !bodyText) throw new Error('Subjek dan isi email wajib diisi.');

      const sent = await sendEmail({
        to,
        subject,
        text: bodyText,
        tenantId: scope.effectiveTid,
        saveToSent: false,
      });
      return {
        success: true,
        provider: sent.provider,
        replyTo: sent.replyTo,
        to,
        subject,
        message: `Email berhasil dikirim ke ${to} (Reply-To: ${sent.replyTo}).`,
      };
    }

    case 'admin_workspace_overview': {
      if (!scope.isAdmin) {
        throw new Error('Akses ditolak: Hanya Admin yang dapat melihat ringkasan workspace.');
      }
      const lim = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
      const usersRes = await dbWrite.execute({
        sql: `SELECT id, email, role, tenant_id, created_at FROM users ORDER BY created_at DESC LIMIT ?;`,
        args: [lim],
      });
      return {
        usersCount: usersRes.rows?.length || 0,
        users: usersRes.rows || [],
      };
    }

    default:
      throw new Error(`Tool "${toolName}" tidak dikenali atau tidak tersedia untuk akun Anda.`);
  }
}

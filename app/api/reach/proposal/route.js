import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateProposalDraft } from '@/lib/llm';
import { sessionFromRequest } from '@/lib/auth';
import { getSettings, consumeTenantQuota } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const placeId = searchParams.get('placeId');

    if (!placeId) {
      return NextResponse.json({ success: false, error: 'Parameter placeId diperlukan.' }, { status: 400 });
    }

    const session = await sessionFromRequest(request);
    const tid = session?.tid || null;

    let sql = `SELECT * FROM proposals WHERE place_id = ?`;
    const args = [placeId];
    if (tid) {
      sql += ` AND tenant_id = ?`;
      args.push(tid);
    } else {
      sql += ` AND (tenant_id IS NULL OR tenant_id = 'tnt_master' OR tenant_id = '')`;
    }
    sql += ` ORDER BY updated_at DESC LIMIT 1;`;

    const res = await db.execute({ sql, args });

    return NextResponse.json({ success: true, proposal: res.rows?.[0] || null });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await sessionFromRequest(request);
    const tid = session?.tid || null;
    const body = await request.json().catch(() => ({}));
    const { placeId, analysisId, lang = 'auto' } = body;

    if (!placeId) {
      return NextResponse.json({ success: false, error: 'Parameter placeId diperlukan.' }, { status: 400 });
    }

    if (tid) {
      const tSettings = await getSettings(tid);
      if (tSettings && tSettings.feat_ai_proposal === 0) {
        return NextResponse.json(
          { success: false, error: 'Modul AI Proposal sedang dinonaktifkan. Anda dapat mengaktifkannya di menu Pengaturan Akun & Fitur > Fitur & Otomasi.' },
          { status: 403 }
        );
      }
      await consumeTenantQuota(tid, 'ai');
    }

    // 1. Fetch place info
    const placeRes = await db.execute({
      sql: `SELECT * FROM places WHERE overture_id = ?;`,
      args: [placeId]
    });
    const place = placeRes.rows?.[0];
    if (!place) {
      return NextResponse.json({ success: false, error: 'Perusahaan tidak ditemukan.' }, { status: 404 });
    }

    // 2. Fetch analysis
    let analysisRes;
    if (analysisId) {
      analysisRes = await db.execute({
        sql: `SELECT * FROM analyses WHERE id = ?;`,
        args: [analysisId]
      });
    } else {
      analysisRes = await db.execute({
        sql: `SELECT * FROM analyses WHERE place_id = ? ORDER BY created_at DESC LIMIT 1;`,
        args: [placeId]
      });
    }

    const rawAnalysis = analysisRes.rows?.[0];
    if (!rawAnalysis) {
      return NextResponse.json({
        success: false,
        error: 'Belum ada analisis perusahaan. Silakan lakukan Analisis Perusahaan terlebih dahulu sebelum menyusun proposal.'
      }, { status: 400 });
    }

    let parsedAnalysis = { ...rawAnalysis };
    try {
      parsedAnalysis.needs = JSON.parse(rawAnalysis.needs);
      parsedAnalysis.use_cases = JSON.parse(rawAnalysis.use_cases);
      parsedAnalysis.unknowns = JSON.parse(rawAnalysis.unknowns);
    } catch (e) {
      // keep raw
    }

    // 3. Generate proposal content incorporating 3-pillar analysis
    const markdownContent = await generateProposalDraft({
      companyName: place.name,
      category: place.bidang_usaha || place.category_raw,
      analysis: parsedAnalysis,
      place,
      lang,
      tenantId: tid
    });

    const proposalId = `prop_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();
    const proposalTitle = `Proposal Solusi AI - ${place.name}`;

    // 4. Save proposal with tenant_id isolation
    await db.execute({
      sql: `
        INSERT INTO proposals (id, place_id, analysis_id, title, content, status, version, created_at, updated_at, tenant_id)
        VALUES (?, ?, ?, ?, ?, 'draft', 1, ?, ?, ?);
      `,
      args: [proposalId, placeId, rawAnalysis.id, proposalTitle, markdownContent, nowIso, nowIso, tid || 'tnt_master']
    });

    // 5. Update reach status overlay and places
    await db.execute({
      sql: `
        INSERT INTO places_status_overlay (place_id, reach_status, updated_at, tenant_id)
        VALUES (?, 'proposal_draft', ?, ?)
        ON CONFLICT(place_id) DO UPDATE SET
          reach_status = 'proposal_draft',
          updated_at = excluded.updated_at,
          tenant_id = excluded.tenant_id;
      `,
      args: [placeId, nowIso, tid || 'tnt_master']
    }).catch(() => null);

    await db.execute({
      sql: `UPDATE places SET reach_status = 'proposal_draft' WHERE overture_id = ?;`,
      args: [placeId]
    });

    return NextResponse.json({
      success: true,
      proposal: {
        id: proposalId,
        place_id: placeId,
        analysis_id: rawAnalysis.id,
        title: proposalTitle,
        content: markdownContent,
        status: 'draft',
        version: 1,
        created_at: nowIso,
        updated_at: nowIso
      }
    });
  } catch (err) {
    if (!err.status) console.error('Proposal generation error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: err.status || 500 });
  }
}

export async function PUT(request) {
  try {
    const session = await sessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { id, content, status, title } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Parameter id proposal diperlukan.' }, { status: 400 });
    }

    const tid = session?.tid || null;
    let sql = `
      UPDATE proposals
      SET 
        content = COALESCE(?, content),
        status = COALESCE(?, status),
        title = COALESCE(?, title),
        updated_at = ?
      WHERE id = ?
    `;
    const args = [content, status, title, new Date().toISOString(), id];

    if (tid) {
      sql += ` AND tenant_id = ?`;
      args.push(tid);
    } else {
      sql += ` AND (tenant_id IS NULL OR tenant_id = 'tnt_master' OR tenant_id = '')`;
    }
    sql += ';';

    const res = await db.execute({ sql, args });
    if (res.rowsAffected === 0) {
      return NextResponse.json({ success: false, error: 'Proposal tidak ditemukan atau tidak memiliki akses.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Proposal berhasil diperbarui.' });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

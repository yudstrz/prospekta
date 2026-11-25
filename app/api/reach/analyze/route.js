import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { performCompanyIntelligence } from '@/lib/intelligence';
import { sessionFromRequest } from '@/lib/auth';
import { consumeTenantQuota } from '@/lib/tenant';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const placeId = searchParams.get('placeId');

    if (!placeId) {
      return NextResponse.json({ success: false, error: 'Parameter placeId diperlukan.' }, { status: 400 });
    }

    const res = await db.execute({
      sql: `SELECT * FROM analyses WHERE place_id = ? ORDER BY created_at DESC LIMIT 1;`,
      args: [placeId]
    });

    const analysis = res.rows?.[0] || null;
    if (analysis) {
      const safeJson = (val, fb = null) => {
        try { return val ? JSON.parse(val) : fb; } catch { return fb; }
      };
      analysis.needs = safeJson(analysis.needs, []);
      analysis.use_cases = safeJson(analysis.use_cases, []);
      analysis.unknowns = safeJson(analysis.unknowns, []);
      analysis.crawled_pages = safeJson(analysis.crawled_pages, []);
      analysis.search_intelligence = safeJson(analysis.search_intelligence, null);
      analysis.google_place = safeJson(analysis.google_place, null);
      analysis.key_people = safeJson(analysis.key_people, []);
    }

    return NextResponse.json({ success: true, analysis });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await sessionFromRequest(request);
    const tid = session?.tid || null;
    const body = await request.json().catch(() => ({}));
    const { placeId, manualText, websiteUrl, lang = 'en' } = body;

    if (!placeId) {
      return NextResponse.json({ success: false, error: 'Parameter placeId diperlukan.' }, { status: 400 });
    }

    if (tid) {
      await consumeTenantQuota(tid, 'ai');
    }

    const intelResult = await performCompanyIntelligence({ placeId, manualText, websiteUrl, lang, tenantId: tid, userId: session?.uid || null });

    if (!intelResult.success) {
      return NextResponse.json(
        { success: false, error: intelResult.error || 'Analisis gagal dijalankan.' },
        { status: intelResult.error?.includes('tidak ditemukan') ? 404 : 500 }
      );
    }

    return NextResponse.json(intelResult);
  } catch (err) {
    if (!err.status) console.error('Analyze error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: err.status || 500 });
  }
}
